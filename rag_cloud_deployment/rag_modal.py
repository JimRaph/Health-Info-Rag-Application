#rag_modal.py
from __future__ import annotations
import asyncio
import os
import json
import logging
import time
from typing import List, Dict, Tuple, Optional, Any

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

import modal
from modal import App, Image, Secret, fastapi_endpoint, enter, method

from s3_utils import download_chroma_folder_from_s3
import chromadb
from chromadb.api import Collection
from chromadb import PersistentClient

from models import (
    CHROMA_DIR, CHROMA_DIR_INF, CHROMA_COLLECTION, CHROMA_CACHE_COLLECTION,
    TINY_MODEL_ID, DEVICE, LLAMA_3_CONTEXT_WINDOW, SAFETY_BUFFER,
    RETRIEVE_TOP_K_GPU, MAX_NEW_TOKENS_GPU, CROSS_ENCODER_MODEL,
    HistoryMessage, QueryRequest, RAGResponse
)
from llm_pipeline import (
    initialize_lightweight_pipeline, call_llm_pipeline, stream_llm, get_chat_template
)
from rag_pipeline import (
    build_prompt, retrieve_context, rerank_documents,
    prune_messages_to_fit_context, rule_based_intent_classification
)

logging.basicConfig(level=logging.INFO, format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}')
logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SEC = 1800

rag_image = (
    Image.from_registry("nvidia/cuda:12.1.0-base-ubuntu22.04", add_python="3.11")
    .apt_install("git")
    .pip_install_from_requirements("requirements.txt")
    .env({"HF_HOME": "/models/huggingface"})
    .add_local_python_source("s3_utils", copy=True)
    .add_local_dir(
        local_path="./",
        remote_path="/root",
        ignore=[
            "__pycache__/", "utils/", "Dockerfile", "chroma_db_files/", "model/",
            "hg_login.py", "infer.py", "inference_chroma.py", "initial.py", "README.md",
            "requirements_heavy.txt", "requirements_light.txt", "upload_model.py", ".env",
            ".git/", "*.pyc", ".python-version", "test_*.py", "experiments/", "logs/"
        ],
        copy=True
    )
)

app = App("who-rag-llama3-gpu-api", image=rag_image)

@app.cls(
    gpu="T4",
    secrets=[
        Secret.from_name("aws-credentials"), 
        Secret.from_name("chromadb"),
        Secret.from_name("huggingface-token")
    ],
    timeout=1080,
    startup_timeout=600,
    memory=32768,
    scaledown_window=120,
    volumes={
        "/models": modal.Volume.from_name("model-cache", create_if_missing=True)
    },
)


class RagService:
    chroma_collection: Optional[Collection] = None
    cache_collection: Optional[Collection] = None
    cross_encoder: Any = None
    embedding_model: Any = None
    intent_pipeline: Any = None
    intent_tokenizer: Any = None

    @enter()
    def setup(self):
        import torch
        from sentence_transformers import CrossEncoder
        from fastembed import TextEmbedding
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
        from transformers import BitsAndBytesConfig

        logger.info("Starting Modal Service setup...")
        
        os.environ["HF_HOME"] = "/models/huggingface"
        os.environ["TRANSFORMERS_CACHE"] = "/models/huggingface"
        os.environ["SENTENCE_TRANSFORMERS_HOME"] = "/models/sentence-transformers"
        os.environ["FASTEMBED_CACHE_PATH"] = "/models/fastembed"
        os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
        
        try:
            torch.cuda.empty_cache()

            if CHROMA_DIR is None:
                raise RuntimeError("CHROMA_DIR not set")
            download_chroma_folder_from_s3(CHROMA_DIR, CHROMA_DIR_INF)
            client = PersistentClient(path=CHROMA_DIR_INF, settings=chromadb.Settings(allow_reset=False))
            self.chroma_collection = client.get_collection(name=CHROMA_COLLECTION)
            self.cache_collection = client.get_or_create_collection(name=CHROMA_CACHE_COLLECTION)
            logger.info(f"Loaded collection: {CHROMA_COLLECTION}")

            self.embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
            _ = list(self.embedding_model.embed(["warmup"]))
            logger.info("Embedding model loaded")

            self.cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL, device="cuda")
            logger.info("Cross-encoder loaded")

            logger.info(f"Loading LLM from volume: /models/llm")
            self.intent_pipeline, self.intent_tokenizer = initialize_lightweight_pipeline("/models/llm", DEVICE)
            logger.info("LLM loaded")
            logger.info("All RAG components loaded successfully")

            torch.cuda.empty_cache()

        except Exception as e:
            logger.error(f"Setup failed: {e}", exc_info=True)
            raise RuntimeError(f"Service setup failed: {e}")

    
    @method()
    async def classify_intent(self, query: str) -> str:
        """Classify query intent using the pre-loaded intent pipeline"""
        
        if not self.intent_pipeline or not self.intent_tokenizer:
            raise HTTPException(status_code=503, detail="Intent classification model not available")
            
        system_prompt = """You are a query classification robot. You MUST respond with ONLY ONE JSON object:
        {"intent": "MEDICAL"}
        {"intent": "GREET"}
        {"intent": "OFF_TOPIC"}
        {"intent": "HARMFUL"}
        """
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Query: {query}"}
        ]
        # messages = [
        #     {"role": "system", "content": system_prompt},
        #     {"role": "user", "content": "Query: What are the symptoms of COVID-19?"},
        #     {"role": "assistant", "content": '{"intent": "MEDICAL"}'},
        #     {"role": "user", "content": f"Query: {query}"}
        # ]
        
        prompt_text = self.intent_tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        try:
            llm_output = await self._run_with_timeout(
                asyncio.to_thread(
                    call_llm_pipeline, 
                    self.intent_pipeline, 
                    prompt_text, 
                    True, 25, False
                ),
                # timeout_seconds=30,
                timeout_message="Intent classification timed out"
            )
            
            clean_output = llm_output.strip().replace("```json", "").replace("```", "")
            start_idx = clean_output.find('{')
            end_idx = clean_output.rfind('}')
            if start_idx != -1 and end_idx != -1:
                json_str = clean_output[start_idx: end_idx + 1]
                data = json.loads(json_str)
                return data.get("intent", "UNKNOWN")
                
        except Exception as e:
            logger.error(f"Failed to parse JSON classifier output: {e}. Raw: {llm_output}")
            
        return rule_based_intent_classification(query)


    @method()
    async def Greet(self, query: str) -> RAGResponse:
        messages = [
            {"role": "system", "content": "You are a greeting assistant. Respond politely to the user greeting in a single line."},
            {"role": "user", "content": query}
        ]
        
        prompt_text = self.intent_tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        answer = await self._run_with_timeout(
            asyncio.to_thread(call_llm_pipeline, self.intent_pipeline, prompt_text, True, 50, True),
            # timeout_seconds=30,
            timeout_message="Greeting response timed out"
        )
        
        return RAGResponse(
            query=query, 
            answer=answer, 
            sources=[], 
            context_chunks=[], 
            expanded_queries=[]
        )

    @method()
    async def HarmOff(self, query: str) -> RAGResponse:
        messages = [
            {"role": "system", "content": "You are an intelligent assistant. Inform the user that you cannot answer harmful/off-topic questions. Keep it short and brief, in one sentence."},
            {"role": "user", "content": query}
        ]
        
        prompt_text = self.intent_tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        answer = await self._run_with_timeout(
            asyncio.to_thread(call_llm_pipeline, self.intent_pipeline, prompt_text, True, 50, True),
            # timeout_seconds=30,
            timeout_message="Safety response timed out"
        )
        
        return RAGResponse(
            query=query, 
            answer=answer, 
            sources=[], 
            context_chunks=[], 
            expanded_queries=[]
        )

    @method()
    async def summarize_history(self, history: List[HistoryMessage]) -> str:
        if not history:
            return ''
            
        history_text = "\n".join([f"{h.role}: {h.content}" for h in history[-8:]])
        summarizer_prompt = f"""You are an intelligent agent who summarizes conversations. 
        Your summary should be concise, coherent, and focus on the main topic and specific entities mentioned in the conversation.
        
        CONVERSATION HISTORY:
        {history_text}
        
        CONCISE SUMMARY:
        """
        
        messages = [{"role": "system", "content": summarizer_prompt}]
        prompt_text = self.intent_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        summary = await self._run_with_timeout(
            asyncio.to_thread(call_llm_pipeline, self.intent_pipeline, prompt_text, True, 150, False),
            # timeout_seconds=60,
            timeout_message="Summarization timed out"
        )
        return summary

    # @method()
    # async def expand_query_with_llm(self, user_query: str, summary: str, history: List[HistoryMessage]) -> List[str]:
    #     if not history or len(history) == 0:
    #         return [user_query]
    #         # expansion_prompt = f"You are a specialized query expansion engine. Generate 2 alternative, highly effective search queries to find documents relevant to the User Query. Only output the queries, one per line. Do not include the original query or any explanations.\nUser Query: {user_query}\nExpanded Queries:\n"
    #     # else:
    #     history_text = "\n".join([f"{h.role}: {h.content}" for h in history])
    #     expansion_prompt = f"""Given the conversation summary and history below, rewrite the user's latest query into a standalone, complete,
    #      and specific search query that incorporates the context of the conversation. Output only the single rewritten query.\n
    #      Conversation Summary: {summary}\n
    #      Conversation History:\n{history_text}\n
    #      User's Latest Query: {user_query}\n
    #      Rewritten Search Query:\n"""
        
    #     messages = [{"role": "system", "content": expansion_prompt}]
    #     prompt_text = self.intent_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
    #     llm_output = await self._run_with_timeout(
    #         asyncio.to_thread(call_llm_pipeline, self.intent_pipeline, prompt_text, True, 150, True),
    #         # timeout_seconds=60,
    #         timeout_message="Query expansion timed out"
    #     )
        
    #     if not history or len(history) == 0 or len(history) < 2:
    #         # expanded_queries = [q.strip() for q in llm_output.split('\n') if q.strip()]
    #         expanded_queries = [user_query]
    #     else:
    #         expanded_queries = [llm_output.strip()]
        
    #     expanded_queries.append(user_query)
    #     seen = set()
    #     deduped = []
    #     for q in expanded_queries:
    #         if q not in seen:
    #             seen.add(q)
    #             deduped.append(q)
    #     return deduped

    @method()
    async def expand_query_with_llm(self, user_query: str, summary: str, history: List[HistoryMessage]) -> List[str]:
        if not history or len(history) == 0:
            return [user_query]

        history_text = "\n".join([f"{h.role}: {h.content}" for h in history])
        expansion_prompt = (
            f"Given the conversation summary and history below, rewrite the user's latest query "
            f"into a standalone, complete, and specific search query that incorporates the context "
            f"of the conversation. Output only the single rewritten query.\n"
            f"Conversation Summary: {summary}\n"
            f"Conversation History:\n{history_text}\n"
            f"User's Latest Query: {user_query}\n"
            f"Rewritten Search Query:\n"
        )
        
        messages = [{"role": "system", "content": expansion_prompt}]
        prompt_text = self.intent_tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        llm_output = await self._run_with_timeout(
            asyncio.to_thread(
                call_llm_pipeline, 
                self.intent_pipeline, 
                prompt_text, 
                True,  
                150, 
                True 
            ),
            timeout_message="Query expansion timed out"
        )
        
        expanded_queries = [llm_output.strip()]
        expanded_queries.append(user_query)
        
        seen = set()
        deduped = []
        for q in expanded_queries:
            if q not in seen:
                seen.add(q)
                deduped.append(q)
        return deduped

    

    @fastapi_endpoint(method="POST")
    async def rag_endpoint(self, request_data: Dict[str, Any]):
        try:
            request = QueryRequest(**request_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid request format: {str(e)}")

        start = time.time()

        try:
            logger.info(f'Processing query: {request.query[:100]}...')
            intent = await self.classify_intent.local(request.query)
            logger.info(f"Intent classified as: {intent}")

            if intent == 'GREET':
                response = await self.Greet.local(request.query)
                if request.stream:
                    def event_generator():
                        yield f"event: token\ndata: {json.dumps({'text': response.answer})}\n\n"
        
                    return StreamingResponse(
                        event_generator(),
                        media_type="text/event-stream"
                    )
                else:
                    return response.model_dump()

            elif intent in ["HARMFUL", "OFF_TOPIC"]:
                response = await self.HarmOff.local(request.query)

                if request.stream:
                    def event_generator():
                        yield f"event: token\ndata: {json.dumps({'text': response.answer})}\n\n"
                        # yield f"event: done\ndata: {json.dumps({'conversationId': response.conversation_id})}\n\n"
        
                    return StreamingResponse(
                        event_generator(),
                        media_type="text/event-stream"
                    )
                else:
                    return response.model_dump()

            else:
                logger.info("Starting full RAG pipeline for medical query")
                history = request.history
                if len(history) >= 3:
                    summary = await self.summarize_history.local(request.history)
                else:
                    summary = " | ".join([f"{h.role}: {h.content}" for h in history])
                
                expanded_queries = await self.expand_query_with_llm.local(
                    request.query, summary, request.history
                )

                context_data, _ = await self._run_with_timeout(
                    asyncio.to_thread(
                        retrieve_context,
                        expanded_queries,
                        self.embedding_model,
                        self.chroma_collection
                    ),
                    timeout_message="Document retrieval timed out"
                )
                logger.info(f"Retrieved {len(context_data)} context chunks")

                final_context = await self._run_with_timeout(
                    asyncio.to_thread(
                        rerank_documents,
                        request.query,
                        context_data,
                        RETRIEVE_TOP_K_GPU,
                        self.cross_encoder
                    ),
                    timeout_message="Document reranking timed out"
                )
                logger.info(f"Reranked to {len(final_context)} chunks")

                final_sources = list({c.get('url') for c in final_context if c.get('url')})

                if not final_context:
                    final_answer = "I could not find relevant documents in the knowledge base to answer your question. I can help you if you have another question."
                    response = RAGResponse(
                        query=request.query,
                        answer=final_answer,
                        sources=[],
                        context_chunks=[],
                        expanded_queries=expanded_queries
                    )

                    if request.stream:
                        def event_generator():
                            yield f"event: token\ndata: {json.dumps({'text': response.answer})}\n\n"
            
                        return StreamingResponse(
                            event_generator(),
                            media_type="text/event-stream"
                        )
                    else:
                        return response.model_dump()

                # PURE FUNCTION: build_prompt
                initial_messages = build_prompt(request.query, final_context, summary)
                max_input_tokens = LLAMA_3_CONTEXT_WINDOW - MAX_NEW_TOKENS_GPU - SAFETY_BUFFER

                # PURE FUNCTION: prune_messages_to_fit_context
                # NOTE: no await needed, it's fast and CPU-bound
                final_messages, final_context_pruned, tok_length = await prune_messages_to_fit_context(
                    initial_messages,
                    final_context,
                    summary,
                    self.intent_tokenizer,
                    max_input_tokens
                )

                context_chunks_text = [c['text'] for c in final_context_pruned]
                prompt_text = self.intent_tokenizer.apply_chat_template(
                    final_messages, tokenize=False, add_generation_prompt=True
                )

                # max_new = max(
                #     MAX_NEW_TOKENS_GPU,
                #     tok_length if isinstance(tok_length, int) and tok_length > 0 else MAX_NEW_TOKENS_GPU
                # )

                max_new = MAX_NEW_TOKENS_GPU
                if isinstance(tok_length, int) and tok_length > 0:
                    max_new = min(max_new, tok_length)               

                # STREAMING BRANCH
                if request.stream:
                    def event_generator():
                        yield f"event: status\ndata: {json.dumps({'step': 'searching_documents'})}\n\n"

                        meta = {
                            "sources": final_sources,
                            # "context_chunks": context_chunks_text,
                            # "expanded_queries": expanded_queries,
                        }
                        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

                        yield f"event: status\ndata: {json.dumps({'step': 'generating_answer'})}\n\n"
                        yield f"event: token\ndata: {json.dumps({'text': ''})}\n\n"

                        # PURE FUNCTION: stream_llm (needs self.intent_pipeline)
                        for token in stream_llm(self.intent_pipeline, prompt_text, max_new, deterministic=True):
                            yield f"event: token\ndata: {json.dumps({'text': token})}\n\n"

                        yield f"event: done\ndata: {json.dumps({})}\n\n"

                    return StreamingResponse(
                        event_generator(),
                        media_type="text/event-stream"
                    )

                # NON-STREAMING BRANCH (your code was missing this!)
                final_answer = await self._run_with_timeout(
                    asyncio.to_thread(
                        call_llm_pipeline,
                        self.intent_pipeline,
                        prompt_text,
                        False,
                        max_new,
                        False
                    ),
                    timeout_message="Answer generation timed out"
                )

                response = RAGResponse(
                    query=request.query,
                    answer=final_answer,
                    sources=final_sources,
                    context_chunks=context_chunks_text,
                    expanded_queries=expanded_queries
                )

                end_time = time.time()
                logger.info(f"Total Latency: {round(end_time - start, 2)}s")
                return response.model_dump()

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unhandled exception in RAG handler: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    
    async def _run_with_timeout(self, awaitable: Any, timeout_seconds: int = 300, timeout_message: str = "Request timed out") -> Any:
        try:
            return await asyncio.wait_for(awaitable, timeout=timeout_seconds)
        except asyncio.TimeoutError:
            logger.warning(f"Operation timed out after {timeout_seconds}s: {timeout_message}")
            raise HTTPException(status_code=504, detail=timeout_message)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in _run_with_timeout: {e}")
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")