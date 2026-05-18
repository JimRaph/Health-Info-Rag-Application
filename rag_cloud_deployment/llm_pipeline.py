#llm_pipeline.py
import logging
from typing import Optional, List
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def get_chat_template():
    return (
        "{% for message in messages %}"
        "{% if message['role'] == 'system' %}"
            "{{ message['content'] }} "
        "{% elif message['role'] == 'user' %}"
            "{{ '<|start_header_id|>user<|end_header_id|>\\n' + message['content'] + '<|eot_id|>' }} "
        "{% elif message['role'] == 'assistant' %}"
            "{{ '<|start_header_id|>assistant<|end_header_id|>\\n' + message['content'] + '<|eot_id|>' }} "
        "{% endif %}"
        "{% endfor %}"
        "{% if add_generation_prompt %}"
            "{{ '<|start_header_id|>assistant<|end_header_id|>\\n' }} "
        "{% endif %}"
    )

def initialize_lightweight_pipeline(model_id: str, device: str):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
    from transformers import BitsAndBytesConfig
    
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        device_map="auto",
        trust_remote_code=True,
        quantization_config=quantization_config,
        dtype=torch.bfloat16,
        local_files_only=True
    )
    
    tokenizer = AutoTokenizer.from_pretrained(model_id, local_files_only=True)
    
    if not getattr(tokenizer, "chat_template", None):
        tokenizer.chat_template = get_chat_template()
        
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        
    pipe = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
        device_map="auto",
        dtype=torch.bfloat16
    )
    
    return pipe, tokenizer

def call_llm_pipeline(pipe, prompt_text: str, deterministic: bool = False, 
                      max_new_tokens: int = 1024, is_expansion: bool = False) -> str:
    import torch
    if pipe is None or not hasattr(pipe, "tokenizer"):
        raise HTTPException(status_code=503, detail="LLM pipeline is not available.")
        
    temp = 0.0 if deterministic else 0.1 if is_expansion else 0.6
    
    try:
        with torch.inference_mode():
            outputs = pipe(
                prompt_text,
                max_new_tokens=max_new_tokens,
                temperature=(temp if temp > 0.0 else None),
                do_sample=True if temp > 0.0 else False,
                pad_token_id=pipe.tokenizer.eos_token_id,
                return_full_text=False
            )
            
        if isinstance(outputs, list) and len(outputs) > 0 and isinstance(outputs[0], dict):
            text = outputs[0].get('generated_text', "")
        elif isinstance(outputs, dict):
            text = outputs.get('generated_text', "")
        else:
            text = str(outputs)
            
        text = text.strip()
        for token in ['<|eot_id|>', '<|end_of_text|>']:
            if token in text:
                text = text.split(token)[0].strip()
        return text
            
    except Exception as e:
        logger.error(f"Error calling LLM pipeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {str(e)}")

def stream_llm(pipe, prompt_text: str, max_new_tokens: int, deterministic: bool = False):
    """Generator that yields tokens as the LLM produces them."""
    from transformers import TextIteratorStreamer
    from threading import Thread
    
    streamer = TextIteratorStreamer(
        pipe.tokenizer,
        skip_prompt=True,
        skip_special_tokens=True
    )

    generation_kwargs = dict(
        text_inputs=prompt_text,
        max_new_tokens=max_new_tokens,
        temperature=0.3 if deterministic else 0.7,
        do_sample=False if deterministic else True,
        pad_token_id=pipe.tokenizer.eos_token_id,
        return_full_text=False,
        streamer=streamer,
    )

    thread = Thread(target=pipe, kwargs=generation_kwargs)
    thread.start()

    for text in streamer:
        if text:
            yield text

    thread.join()