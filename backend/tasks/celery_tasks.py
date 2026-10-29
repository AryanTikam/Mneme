"""Celery Background Tasks for Mneme.

Handles:
1. Asynchronous PDF extraction, LangChain chunking, and Qdrant vector indexing.
2. Background LangGraph Flashcard / Quiz deck generation.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from celery_app import celery_app
from config import settings
from services.database import mongo_manager
from services.embedding_service import embedding_service
from services.qdrant_service import qdrant_service
from workflows.generator_graph import generator_graph

logger = logging.getLogger("mneme.tasks")


try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter  # type: ignore
    except ImportError:
        class RecursiveCharacterTextSplitter:  # type: ignore
            def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150, separators: Optional[List[str]] = None):
                self.chunk_size = chunk_size
                self.chunk_overlap = chunk_overlap

            def split_text(self, text: str) -> List[str]:
                step = max(1, self.chunk_size - self.chunk_overlap)
                chunks = [text[i : i + self.chunk_size] for i in range(0, len(text), step)]
                return [c for c in chunks if c.strip()] or [text]


def _extract_text_from_file(file_path: str) -> str:
    """Extract plain text from PDF, DOCX, TXT, or Markdown file."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        text_parts = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n\n".join(text_parts)

    elif suffix in (".txt", ".md"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    elif suffix == ".docx":
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n".join([p.text for p in doc.paragraphs if p.text])
        except ImportError:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()

    # Fallback raw read
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _safe_update_state(task_self: Any, state: str, meta: Dict[str, Any]) -> None:
    if task_self and hasattr(task_self, "update_state"):
        req = getattr(task_self, "request", None)
        if req and getattr(req, "id", None):
            try:
                task_self.update_state(state=state, meta=meta)
            except Exception:
                pass


def execute_ingest(
    file_path: str,
    document_id: str,
    user_id: str,
    filename: str,
    task_self: Any = None,
) -> Dict[str, Any]:
    """Core logic to extract text, chunk, embed, and index into Qdrant."""
    _safe_update_state(task_self, "PROGRESS", {"step": "extracting", "progress": 20})
    mongo_manager.update_document_status(document_id, "extracting")

    # 1. Text extraction
    extracted_text = _extract_text_from_file(file_path)
    if not extracted_text.strip():
        raise ValueError("Extracted document text is empty.")

    _safe_update_state(task_self, "PROGRESS", {"step": "chunking", "progress": 45})

    # 2. Semantic text chunking
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(extracted_text)
    logger.info("Split document %s into %d semantic chunks.", document_id, len(chunks))

    _safe_update_state(task_self, "PROGRESS", {"step": "vectorizing", "progress": 70})
    mongo_manager.update_document_status(document_id, "vectorizing")

    # 3. Dense vector embeddings
    embeddings = embedding_service.embed_documents(chunks)

    # 4. Multi-tenant Qdrant indexing
    metadatas = [
        {"filename": filename, "chunk_index": idx, "char_length": len(chunk)}
        for idx, chunk in enumerate(chunks)
    ]
    qdrant_service.upsert_chunks(
        user_id=user_id,
        document_id=document_id,
        chunks=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    # 5. Finalize document status in MongoDB
    _safe_update_state(task_self, "PROGRESS", {"step": "saving", "progress": 95})
    mongo_manager.update_document_status(
        document_id,
        "ready",
        {
            "chunk_count": len(chunks),
            "total_chars": len(extracted_text),
            "summary": extracted_text[:400] + "...",
            "sample_text": extracted_text[:10000],
            "key_chunks": chunks[:12],
        },
    )

    # Clean up temporary uploaded file safely
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass

    logger.info("Ingestion complete for document %s.", document_id)
    task_id = getattr(getattr(task_self, "request", None), "id", f"sync_{document_id}")
    return {
        "task_id": task_id,
        "document_id": document_id,
        "user_id": user_id,
        "status": "ready",
        "chunk_count": len(chunks),
    }


def execute_generate_deck(
    document_id: str,
    user_id: str,
    mode: str = "flashcards",
    task_self: Any = None,
) -> Dict[str, Any]:
    """Core logic to run LangGraph generator graph and persist deck."""
    import time
    _safe_update_state(task_self, "PROGRESS", {"step": "generating", "progress": 30})

    # Retry fetching document record in case ingestion write is still settling
    doc_record = None
    for _ in range(4):
        doc_record = mongo_manager.get_document(document_id, user_id)
        if doc_record:
            break
        time.sleep(0.5)

    # Fetch representative chunks for context from Qdrant
    chunks = qdrant_service.search_chunks(
        user_id=user_id,
        query_vector=embedding_service.embed_text("key concepts principles definitions theorems algorithms"),
        top_k=8,
        document_id=document_id,
    )

    if not doc_record and not chunks:
        # Fallback query without tenant filter in case user_id defaulted
        chunks = qdrant_service.search_chunks(
            user_id="user_default",
            query_vector=embedding_service.embed_text("key concepts principles definitions theorems algorithms"),
            top_k=8,
            document_id=document_id,
        )

    if not doc_record and not chunks:
        raise ValueError(f"Document {document_id} not found for user {user_id}")

    if chunks:
        source_text = "\n\n".join(c.get("text", "") for c in chunks)
    elif doc_record and doc_record.get("sample_text"):
        source_text = doc_record["sample_text"]
    elif doc_record and doc_record.get("key_chunks"):
        source_text = "\n\n".join(doc_record["key_chunks"])
    else:
        source_text = (doc_record or {}).get("summary", "General course overview.")

    _safe_update_state(task_self, "PROGRESS", {"step": "graph_execution", "progress": 60})

    # Run LangGraph Flashcard / Quiz graph
    initial_state = {
        "raw_text": source_text,
        "document_id": document_id,
        "mode": mode,
        "prompt": "",
        "llm_output": "",
        "parsed_output": None,
        "error_message": None,
        "retry_count": 0,
        "is_valid": False,
    }

    final_state = generator_graph.invoke(initial_state)

    deck_id = f"deck_{uuid.uuid4().hex[:12]}"
    filename = (doc_record or {}).get("filename", f"Notes_{document_id[:8]}")
    title = filename.rsplit(".", 1)[0]
    parsed_out = final_state.get("parsed_output") or {}

    if mode == "flashcards":
        items = parsed_out.get("cards", [])
    else:
        items = parsed_out.get("questions", [])

    deck_doc = {
        "deck_id": deck_id,
        "title": f"{title} ({mode.capitalize()})",
        "document_id": document_id,
        "user_id": user_id,
        "mode": mode,
        "cards_count": len(items),
        "mastery": 0,
        "items": items,
        "hue": "bg-primary",
    }

    mongo_manager.save_deck(deck_doc)
    logger.info("Deck %s created with %d items.", deck_id, len(items))

    task_id = getattr(getattr(task_self, "request", None), "id", f"deck_task_{deck_id}")
    return {
        "task_id": task_id,
        "deck_id": deck_id,
        "document_id": document_id,
        "mode": mode,
        "status": "ready",
        "cards_count": len(items),
    }


@celery_app.task(bind=True, name="mneme.ingest_pdf")
def ingest_pdf_task(
    self: Any,
    file_path: str,
    document_id: str,
    user_id: str,
    filename: str,
) -> Dict[str, Any]:
    """Background task to extract text, chunk via LangChain, embed and save to Qdrant."""
    req_id = getattr(getattr(self, "request", None), "id", document_id)
    logger.info("Starting ingestion task %s for doc %s (User %s)...", req_id, document_id, user_id)
    try:
        return execute_ingest(file_path, document_id, user_id, filename, task_self=self)
    except Exception as exc:
        logger.error("Ingestion task failed for document %s: %s", document_id, exc, exc_info=True)
        mongo_manager.update_document_status(document_id, "failed", {"error": str(exc)})
        _safe_update_state(self, "FAILURE", {"error": str(exc)})
        return {"status": "failed", "error": str(exc), "document_id": document_id}


@celery_app.task(bind=True, name="mneme.generate_deck")
def generate_deck_task(
    self: Any,
    document_id: str,
    user_id: str,
    mode: str = "flashcards",
) -> Dict[str, Any]:
    """Background task to run LangGraph generator graph and save resulting deck."""
    req_id = getattr(getattr(self, "request", None), "id", document_id)
    logger.info("Starting deck generation task %s (Mode: %s, Doc: %s)...", req_id, mode, document_id)
    try:
        return execute_generate_deck(document_id, user_id, mode=mode, task_self=self)
    except Exception as exc:
        logger.error("Deck generation task failed: %s", exc, exc_info=True)
        _safe_update_state(self, "FAILURE", {"error": str(exc)})
        return {"status": "failed", "error": str(exc), "document_id": document_id}

