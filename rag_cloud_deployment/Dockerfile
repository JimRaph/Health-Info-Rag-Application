
FROM python:3.11-slim

#for huggingface space
# ENV PORT = 7860
# EXPOSE 7860

WORKDIR /app


RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*


# COPY requirements_heavy.txt .
# RUN pip install --timeout 2000 -r requirements_heavy.txt  \
# --extra-index-url https://download.pytorch.org/whl/cpu


# COPY requirements_light.txt .
# RUN pip install --timeout 2000 -r requirements_light.txt \
# --extra-index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --timeout 2000 -r requirements.txt \
--extra-index-url https://download.pytorch.org/whl/cpu


# COPY inference_chroma.py .
COPY . . 

CMD ["uvicorn", "inference_chroma:app", "--host", "0.0.0.0", "--port", "8000"]
# CMD ["uvicorn", "inference_chroma:app", "--host", "0.0.0.0", "--port", "7860"]
