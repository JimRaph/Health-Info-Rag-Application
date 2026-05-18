modal_rag.py is what is used in production. inference_chroma (together with upload_model) were to faciliate using HF free GPU but I realized on deployment it is free for Gradio projects.

I switched to Modal and it uses a different interface when working with fastapi  @fastapi_endpoint(method="POST")
