#models.py
from __future__ import annotations
import os
from typing import List, Dict, Tuple, Optional, Any, Literal
from pydantic import BaseModel, Field

# Environment
CHROMA_DIR = os.getenv("CHROMA_DIR")
CHROMA_DIR_INF = "/" + CHROMA_DIR if CHROMA_DIR else "/app/chroma_db_files"
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION")
CHROMA_CACHE_COLLECTION = os.getenv("CHROMA_CACHE_COLLECTION")

# Constants
TINY_MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"
DEVICE = "cuda:0"
LLAMA_3_CONTEXT_WINDOW = 8192
SAFETY_BUFFER = 50
RETRIEVE_TOP_K_GPU = 6
MAX_NEW_TOKENS_GPU = 1024
CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

class HistoryMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str

class QueryRequest(BaseModel):
    query: str = Field(..., description="The user's latest message.")
    history: List[HistoryMessage] = Field(default_factory=list)
    stream: bool = Field(False)

class RAGResponse(BaseModel):
    query: str
    answer: str
    sources: List[str]
    context_chunks: List[str]
    expanded_queries: List[str]