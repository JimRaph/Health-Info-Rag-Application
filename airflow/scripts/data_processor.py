from typing import Dict, List
import requests
from bs4 import BeautifulSoup
from langchain_text_splitters import HTMLHeaderTextSplitter
from fastembed import TextEmbedding
import os
from urllib.parse import urljoin
import json
import logging
import hashlib
import time
import chromadb
from chromadb import PersistentClient
from s3_utils import upload_to_s3, download_from_s3, download_all_files, \
upload_chroma_folder_to_s3, download_chroma_folder_from_s3


logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}'
)
logger = logging.getLogger(__name__)

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION")
CHROMA_DIR = os.getenv("CHROMA_DIR")
CHROMA_DB_FILENAME = os.getenv("CHROMA_DB_FILENAME")
EMBEDDING_MODEL = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

WHO_INDEX_URL = "https://www.who.int/news-room/fact-sheets"
PREFIX = "raw_content/"

def fetch_html(url: str) -> str:
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.text

def extract_last_updated_and_hash(html: str) -> Dict[str, str]:
    """
    Extracts the 'last updated' timestamp and computes a SHA256 hash
    of the main WHO fact sheet content section after removing noise.
    """
    soup = BeautifulSoup(html, "html.parser")

    timestamp_el = soup.find(class_="timestamp")
    if timestamp_el:
        last_updated = timestamp_el.get_text(strip=True)
    else:
        date_el = soup.find("div", id="date")
        last_updated = date_el.get_text(strip=True) if date_el else ""

    content_div = (
        soup.find("div", id="PageContent_T0643CD2A003_Col00")
        or soup.find("div", class_="sf_colsIn col-md-8")
        or soup.find("section", id="PageContent_T0643CD2A003_Col00")
        or soup.find("section", class_="sf-content content")
    )

    if content_div:
        for tag in content_div.find_all(["p", "div"]):
            text = tag.get_text(strip=True)
            if not text or text == "\xa0":
                tag.decompose()

        html_content = str(content_div)
    else:
        html_content = ""

    html_hash = hashlib.sha256(html_content.encode("utf-8")).hexdigest()

    return {
        "last_updated": last_updated,
        "hash": html_hash,
        "raw_html": html_content
    }

def topic_data_and_save_to_s3(baseurl: str) -> None:
    logger.info(f"Starting index scrape from {baseurl}")
    try:
        html = fetch_html(baseurl)
        soup = BeautifulSoup(html, "html.parser")
        topics = []

        ul = soup.find("ul", class_="alphabetical-nav")
        if not ul:
            logger.error("Could not find alphabetical navigation list.")
            return

        for li in ul.find_all("li", class_="alphabetical-nav--list-item"):
            for p in li.find_all("p"):
                a = p.find("a")
                if a:
                    topic = a.get_text(strip=True)
                    href = urljoin(baseurl, a["href"])
                    topics.append({"topic": topic, "url": href})

        upload_to_s3(
            file_content=json.dumps(topics),
            object_key="topics/topic_index.json"
        )
        logger.info(f"Uploaded index for {len(topics)} topics.")

    except Exception as e:
        logger.error(f"Index scrape failed: {e}")


def fetch_content_and_save_to_s3() -> None:
    index_content = download_from_s3("topics/topic_index.json")
    if not index_content:
        logger.error("Topic index not found in S3.")
        return

    topics = json.loads(index_content)
    logger.info(f"Checking {len(topics)} fact sheets for updates...")

    for topic_data in topics:
        topic = topic_data["topic"]
        url = topic_data["url"]
        slug = topic.lower().replace(" ", "_").replace("/", "")

        try:
            html = fetch_html(url)
            extracted = extract_last_updated_and_hash(html)

            meta_key = f"raw_content/{slug}_meta.json"
            existing_meta_json = download_from_s3(meta_key)
            if existing_meta_json:
                existing_meta = json.loads(existing_meta_json)
                if (
                    existing_meta.get("hash") == extracted["hash"]
                    and existing_meta.get("last_updated") == extracted["last_updated"]
                ):
                    logger.info(f"No changes detected for {topic}. Skipping reprocessing.")
                    continue 
                
            structured_data = {
                "topic": topic,
                "url": url,
                "raw_html": extracted["raw_html"]
            }

            upload_to_s3(json.dumps(structured_data), f"raw_content/{slug}.json")
            upload_to_s3(json.dumps(extracted), meta_key)

            logger.info(f"Uploaded new raw content and metadata for {topic}.")

        except Exception as e:
            logger.error(f"Failed fetching {topic}: {e}")


def process_and_upload_to_chroma(prefix: str):
    logger.info("Processing changed raw_content/ files into chunks...")
    response = download_all_files(prefix)
    if not response:
        logger.warning("No files found to process.")
        return

    for obj in response["Contents"]:
        key = obj["Key"]
        if key.endswith("_meta.json"):
            continue  
        slug = os.path.basename(key).replace(".json", "")

        raw_data = download_from_s3(key)
        if not raw_data:
            continue

        try:
            data = json.loads(raw_data)
            html = data["raw_html"]
            soup = BeautifulSoup(html, "html.parser")

            chunks = []
            for header in soup.find_all("h2"):
                subtopic = header.get_text(strip=True)

                collected_text = []
                for sibling in header.find_next_siblings():
                    if sibling.name in ["h1", "h2"]:
                        break  
                    text = sibling.get_text(" ", strip=True)
                    if text and text != "\xa0":
                        collected_text.append(text)

                if collected_text:
                    content = "\n".join(collected_text)
                    chunks.append({
                        "page_content": content,
                        "metadata": {
                            "topic": data["topic"],
                            "subtopic": subtopic,
                            "source": data["url"]
                        }
                    })

            if not chunks:
                data = json.loads(raw_data)
                html_splitter = HTMLHeaderTextSplitter(headers_to_split_on=[("h1", "topic"), ("h2", "subtopic")])
                chunks = html_splitter.split_text(data["raw_html"])

        except Exception as e:
            logger.error(f"Chunking failed for {key}: {e}")
            continue

        processed_docs = []
        for i, chunk in enumerate(chunks):
            processed_docs.append({
                "id": f"{data['url']}-{i}",
                "document": chunk.page_content,
                "metadata": {
                    "source": data["url"],
                    "topic": chunk.metadata.get("topic") or data["topic"],
                    "subtopic": chunk.metadata.get("subtopic") or "",
                }
            })


        upload_to_s3(
            json.dumps(processed_docs),
            f"processed/{slug}.json",
        )
        logger.info(f"Processed and uploaded {len(processed_docs)} chunks for {slug}.")


def embed_and_upload_chroma(batch_size: int = 100):
    logger.info("Embedding only updated or new topic documents into Chroma...")

    os.makedirs(CHROMA_DIR, exist_ok=True)
    local_db_path = os.path.join(CHROMA_DIR, CHROMA_DB_FILENAME)
    try:
        os.chmod(CHROMA_DIR, 0o775)
    except Exception as e:
        logger.warning(f"Could not set permissions on {CHROMA_DIR}: {e}")

    if not os.path.exists(local_db_path) or not os.listdir(CHROMA_DIR):
        logger.info(f"{CHROMA_DIR} missing or empty. Attempting to download from S3...")
        download_chroma_folder_from_s3(local_dir=CHROMA_DIR, s3_prefix=CHROMA_DIR)

    if not os.path.exists(local_db_path):
        logger.info("No ChromaDB found locally or on S3 — creating a new one.")
        os.makedirs(CHROMA_DIR, exist_ok=True)

    try:
        client = PersistentClient(path=CHROMA_DIR)
        collection = client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={
                "hnsw:space": "cosine",
                "description": "WHO Fact Sheets Knowledge Base"
            },
            embedding_function=None  
        )
    except Exception as e:
        logger.error(f"Chroma init failed: {e}")
        return

    existing_ids = set()
    try:
        result = collection.get(include=["ids"])
        existing_ids = set(result.get("ids", []))
        logger.info(f"Found {len(existing_ids)} existing embedded documents.")
    except Exception as e:
        logger.warning(f"Failed to fetch existing IDs: {e}")

    processed_files = download_all_files("processed/")
    if not processed_files or not processed_files.get("Contents"):
        logger.warning("No processed files found in S3.")
        return

    for obj in processed_files["Contents"]:
        key = obj["Key"]
        if not key.endswith(".json"):
            continue

        topic_data = download_from_s3(key)
        if not topic_data:
            logger.warning(f"Failed to download {key}. Skipping.")
            continue

        try:
            documents = json.loads(topic_data)
        except json.JSONDecodeError as jde:
            logger.warning(f"Failed to parse JSON from {key}: {jde}. Skipping.")
            continue

        if not documents:
            logger.warning(f"{key} is empty. Skipping.")
            continue

        new_docs = [doc for doc in documents if doc["id"] not in existing_ids]
        if not new_docs:
            logger.info(f"All chunks for {key} already embedded. Skipping.")
            continue

        logger.info(f"Embedding {len(new_docs)} new chunks from {key}...")

        for i in range(0, len(new_docs), batch_size):
            batch = new_docs[i:i + batch_size]
            texts = [d["document"] for d in batch]

            try:
                embeddings = list(EMBEDDING_MODEL.embed(texts))

                collection.add(
                    ids=[d["id"] for d in batch],
                    documents=texts,
                    metadatas=[d["metadata"] for d in batch],
                    embeddings=embeddings
                )
                logger.info(f"Inserted batch {i}-{i + len(batch)} for {key}.")
            except Exception as e:
                logger.error(f"Embedding batch failed for {key}: {e}")

    upload_chroma_folder_to_s3(local_dir=CHROMA_DIR, s3_prefix=CHROMA_DIR)
    logger.info("ChromaDB embedding complete and synced to S3.")

def run_all():
    logger.info('.................STARTING DATA PIPELINE...............')
    topic_data_and_save_to_s3(WHO_INDEX_URL)
    fetch_content_and_save_to_s3()
    process_and_upload_to_chroma(PREFIX)
    embed_and_upload_chroma()
    logger.info("................DATA PIPELINE ENDED..................")
    

if __name__ == "__main__":
    run_all()
