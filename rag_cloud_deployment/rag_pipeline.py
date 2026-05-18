#rag_pipeline.py
import logging
from typing import List, Dict, Tuple
from fastapi import HTTPException

from models import LLAMA_3_CONTEXT_WINDOW, MAX_NEW_TOKENS_GPU, SAFETY_BUFFER, RETRIEVE_TOP_K_GPU

logger = logging.getLogger(__name__)

def build_prompt(user_query: str, context: List[Dict], summary: str) -> List[Dict]:
    
    context_text = "\n---\n".join([
        f"Source: {c.get('url', 'N/A')}\n{c['text']}" 
        for c in context
    ]) if context else "No relevant context found."
    
    # system_prompt = (
    #     "You are a helpful and harmless medical assistant, specialized in answering health-related questions "
    #     "based ONLY on the provided retrieved context. Follow these strict rules:\n"
    #     "1. **DO NOT** use any external knowledge. If the answer is not in the context, state that you cannot find "
    #     "the information in the knowledge base.\n"
    #     "2. Cite your sources using the URL/Source ID provided in the context (e.g., [Source: URL]). Do not generate fake URLs.\n"
    #     "3. If the user's query is purely conversational, greet them or respond appropriately without referencing the context.\n"
    # )

    system_prompt = (
        "You are a helpful medical assistant. Answer the user's question using ONLY the provided context. "
        "Follow these rules strictly:\n"
        "1. Synthesize information into a clear, natural answer. Do NOT repeat raw context chunks.\n"
        "2. User query may sometimes contain misspelling, example 'Bolitulism' instead of 'Botulism' so correct using closest context in your knowledge base.\n"
        "3. Use plain text only. Do NOT use markdown formatting like asterisks (*), bold (**), or bullet points.\n"
        "4. If the answer is not in the context, say you cannot find the information.\n"
        "5. If the user's query is purely conversational, greet them or respond appropriately without referencing the context.\n"
        "6. Be concise and direct. Avoid repeating information or adding unnecessary disclaimers and stay within the limit of the retrieved context.\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": f"PREVIOUS CONVERSATION SUMMARY: {summary}" if summary else "PREVIOUS CONVERSATION SUMMARY: None"},
        {"role": "system", "content": f"RETRIEVED CONTEXT:\n{context_text}"},
        {"role": "user", "content": user_query}
    ]
    return messages

def get_token_count(msg_list: List[Dict], tokenizer) -> int:
    if not tokenizer:
        return 0
    prompt_text = tokenizer.apply_chat_template(msg_list, tokenize=False, add_generation_prompt=True)
    return len(tokenizer.encode(prompt_text, add_special_tokens=False))

def retrieve_context(queries: List[str], embedding_model, chroma_collection) -> Tuple[List[Dict], List[str]]:
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded.")
        
    embeddings_list = [[float(x) for x in emb] for emb in embedding_model.embed(queries, batch_size=8)]
    results = chroma_collection.query(
        query_embeddings=embeddings_list,
        n_results=min(10, RETRIEVE_TOP_K_GPU * len(queries)),
        include=['documents', 'metadatas']
    )
    logger.info(f"Query count: {len(queries)}, n_results requested: {min(10, RETRIEVE_TOP_K_GPU * len(queries))}")
    
    context_data = []
    source_urls = set()
    if results.get("documents") and results.get("metadatas"):
        for docs_list, metadatas_list in zip(results["documents"], results["metadatas"]):
            for doc, metadata in zip(docs_list, metadatas_list):
                if doc and metadata:
                    context_data.append({'text': doc, 'url': metadata.get('source')})
                    if metadata.get("source"):
                        source_urls.add(metadata.get('source'))
    return context_data, list(source_urls)

def rerank_documents(query: str, context: List[Dict], top_k: int, cross_encoder) -> List[Dict]:
    if not context or cross_encoder is None:
        return context[:top_k]
        
    pairs = [(query, doc['text']) for doc in context]
    scores = cross_encoder.predict(pairs)
    for doc, score in zip(context, scores):
        doc['score'] = float(score)
    ranked_docs = sorted(context, key=lambda x: x['score'], reverse=True)
    return ranked_docs[:top_k]

def rule_based_intent_classification(self, query: str) -> str:
    query_lower = query.lower().strip()
    
    greeting_words = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'how are you']
    harmful_keywords = ['harm', 'hurt', 'kill', 'danger', 'illegal', 'prescription without', 'suicide']
    medical_keywords = ['covid', 'fever', 'pain', 'symptom', 'treatment', 'medicine', 'doctor', 'health', 'disease', 'virus']
    
    if any(word in query_lower for word in greeting_words) or len(query_lower.split()) <= 2:
        return 'GREET'
    elif any(word in query_lower for word in harmful_keywords):
        return 'HARMFUL'
    elif not any(word in query_lower for word in medical_keywords) and len(query_lower.split()) > 3:
        return 'OFF_TOPIC'
    else:
        return 'MEDICAL'


async def prune_messages_to_fit_context(messages: List[Dict], final_context: List[Dict], 
                                        summary: str, tokenizer, max_input_tokens: int) -> Tuple[List[Dict], List[Dict], int]:
    if not tokenizer:
        raise ValueError("Tokenizer not initialized for pruning.")
        
    current_context = final_context[:]
    current_summary = summary
    base_user_query = messages[-1]["content"]
    
    current_messages = build_prompt(base_user_query, current_context, current_summary)
    token_count = get_token_count(current_messages, tokenizer)
    
    if token_count <= max_input_tokens:
        tok_length = max_input_tokens - token_count
        return current_messages, current_context, tok_length
        
    logger.warning(f"Initial token count ({token_count}) exceeds max input ({max_input_tokens}). Starting pruning.")
    
    while token_count > max_input_tokens and current_context:
        current_context.pop()
        current_messages = build_prompt(base_user_query, current_context, current_summary)
        token_count = get_token_count(current_messages, tokenizer)
        
    if token_count <= max_input_tokens:
        tok_length = max_input_tokens - token_count
        return current_messages, current_context, tok_length
        
    if current_summary:
        logger.warning("Clearing conversation summary as last-ditch effort.")
        current_summary = ""
        current_messages = build_prompt(base_user_query, current_context, current_summary)
        token_count = get_token_count(current_messages, tokenizer)
        
    if token_count <= max_input_tokens:
        tok_length = max_input_tokens - token_count
        return current_messages, current_context, tok_length
        
    logger.error(f"Pruning failed. Even minimal prompt exceeds token limit: {token_count}. Returning empty context.")
    current_context = []
    current_messages = build_prompt(base_user_query, current_context, "")
    token_count = get_token_count(current_messages, tokenizer)
    tok_length = max_input_tokens - token_count if token_count < max_input_tokens else 0
    
    return current_messages, current_context, tok_length