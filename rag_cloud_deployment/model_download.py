#model_download.py
from pathlib import Path
import modal

volume = modal.Volume.from_name("model-cache", create_if_missing=True)
MODEL_DIR = Path("/models")

download_image = (
    modal.Image.debian_slim()
    .pip_install("huggingface_hub", "torch", "transformers", "sentence-transformers", "fastembed", "bitsandbytes", "accelerate")
    .env({"HF_HOME": "/models/huggingface"})
)

app = modal.App("model-downloader", image=download_image)

TINY_MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"
CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

@app.function(
    volumes={MODEL_DIR.as_posix(): volume},
    timeout=600,
    secrets=[modal.Secret.from_name("huggingface-token")]
)
def download_models():
    import os
    from huggingface_hub import snapshot_download
    from sentence_transformers import CrossEncoder
    from fastembed import TextEmbedding
    
    os.environ["HF_HOME"] = "/models/huggingface"
    os.environ["TRANSFORMERS_CACHE"] = "/models/huggingface"
    os.environ["SENTENCE_TRANSFORMERS_HOME"] = "/models/sentence-transformers"
    os.environ["FASTEMBED_CACHE_PATH"] = "/models/fastembed"
    
    print("Downloading embedding model...")
    _ = list(TextEmbedding(model_name="BAAI/bge-small-en-v1.5").embed(["warmup"]))
    
    print("Downloading cross-encoder...")
    _ = CrossEncoder(CROSS_ENCODER_MODEL, device="cuda")
    
    print("Downloading LLM...")
    snapshot_download(repo_id=TINY_MODEL_ID, local_dir="/models/llm", local_dir_use_symlinks=False)
    
    print("All models cached successfully")