"""Celery Background Tasks for Mneme.

Handles:
1. Asynchronous PDF extraction, LangChain chunking, and Qdrant vector indexing.
2. Background LangGraph Flashcard / Quiz deck generation.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
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
                # Ensure Celery result backend doesn't crash on FAILURE state with missing exc_type
                if state == "FAILURE":
                    meta.setdefault("exc_type", "Exception")
                    meta.setdefault("exc_message", str(meta.get("error", "Task execution failed")))
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
    raw_chunks = splitter.split_text(extracted_text)
    chunks = [c.strip() for c in raw_chunks if len(c.strip()) >= 50]
    if not chunks and extracted_text.strip():
        chunks = [extracted_text.strip()[:1000]]
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
    document_id: Optional[str] = None,
    user_id: str = "user_default",
    mode: str = "both",
    deck_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    title: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    task_self: Any = None,
) -> Dict[str, Any]:
    """Core logic to run LangGraph generator graph and persist unified deck."""
    import time
    _safe_update_state(task_self, "PROGRESS", {"step": "generating", "progress": 30})

    # Gather target document context IDs (supports multiple segregated files per deck)
    target_doc_ids: List[str] = []
    if document_ids:
        target_doc_ids.extend([d for d in document_ids if d and d != "custom"])
    if document_id and document_id != "custom" and document_id not in target_doc_ids:
        target_doc_ids.append(document_id)

    if deck_id:
        existing_deck = mongo_manager.get_deck(deck_id, user_id)
        if existing_deck:
            for did in existing_deck.get("document_ids", []):
                if did and did != "custom" and did not in target_doc_ids:
                    target_doc_ids.append(did)

    source_parts: List[str] = []
    for did in target_doc_ids:
        # 1. Search chunks from Qdrant
        chunks = qdrant_service.search_chunks(
            user_id=user_id,
            query_vector=embedding_service.embed_text("key concepts principles definitions theorems algorithms explanations"),
            top_k=6,
            document_id=did,
        )
        if chunks:
            source_parts.append("\n\n".join(c.get("text", "") for c in chunks))
            continue

        # 2. Query document from MongoDB
        doc_record = mongo_manager.get_document(did, user_id)
        if doc_record:
            if doc_record.get("sample_text"):
                source_parts.append(doc_record["sample_text"][:3000])
            elif doc_record.get("key_chunks"):
                source_parts.append("\n\n".join(doc_record["key_chunks"][:6]))
            elif doc_record.get("summary"):
                source_parts.append(doc_record["summary"])

    if source_parts:
        source_text = "\n\n---\n\n".join(source_parts)
    else:
        source_text = custom_prompt or "General study material."

    if custom_prompt:
        source_text = f"FOCUS TOPIC: {custom_prompt}\n\nSOURCE CONTEXT:\n{source_text}"

    _safe_update_state(task_self, "PROGRESS", {"step": "graph_execution", "progress": 60})

    cards: List[Dict[str, Any]] = []
    quizzes: List[Dict[str, Any]] = []

    # 1. Generate flashcards if requested
    if mode in ("both", "flashcards"):
        fc_state = generator_graph.invoke({
            "raw_text": source_text,
            "document_id": target_doc_ids[0] if target_doc_ids else "custom",
            "mode": "flashcards",
            "prompt": "",
            "llm_output": "",
            "parsed_output": None,
            "error_message": None,
            "retry_count": 0,
            "is_valid": False,
        })
        cards_raw = (fc_state.get("parsed_output") or {}).get("cards", [])
        for c in cards_raw:
            cards.append({
                "id": c.get("id") or f"fc_{uuid.uuid4().hex[:8]}",
                "front": c.get("front", ""),
                "back": c.get("back", ""),
                "mastery": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # 2. Generate quiz questions if requested
    if mode in ("both", "quiz"):
        qz_state = generator_graph.invoke({
            "raw_text": source_text,
            "document_id": target_doc_ids[0] if target_doc_ids else "custom",
            "mode": "quiz",
            "prompt": "",
            "llm_output": "",
            "parsed_output": None,
            "error_message": None,
            "retry_count": 0,
            "is_valid": False,
        })
        quizzes_raw = (qz_state.get("parsed_output") or {}).get("questions", [])
        for q in quizzes_raw:
            quizzes.append({
                "id": q.get("id") or f"qz_{uuid.uuid4().hex[:8]}",
                "question": q.get("question", ""),
                "options": q.get("options", []),
                "answer": q.get("answer", 0),
                "explanation": q.get("explanation", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # 3. Save into existing deck or create a new unified deck
    if deck_id:
        existing = mongo_manager.get_deck(deck_id, user_id)
        if existing:
            existing_fc = existing.get("flashcards", [])
            existing_qz = existing.get("quizzes", [])
            existing_fc.extend(cards)
            existing_qz.extend(quizzes)
            existing["flashcards"] = existing_fc
            existing["quizzes"] = existing_qz
            existing["cards_count"] = len(existing_fc)
            existing["quizzes_count"] = len(existing_qz)

            # Ensure attached document_ids are recorded
            current_doc_ids = list(existing.get("document_ids", []))
            for did in target_doc_ids:
                if did not in current_doc_ids:
                    current_doc_ids.append(did)
            existing["document_ids"] = current_doc_ids
            if current_doc_ids:
                existing["document_id"] = current_doc_ids[0]

            if folder_id:
                existing["folder_id"] = folder_id
            mongo_manager.save_deck(existing)
            target_deck_id = deck_id
            deck_title = existing.get("title", "Study Material")
        else:
            deck_id = None

    if not deck_id:
        target_deck_id = f"deck_{uuid.uuid4().hex[:12]}"
        first_doc = None
        if target_doc_ids:
            first_doc = mongo_manager.get_document(target_doc_ids[0], user_id)
        filename = (first_doc or {}).get("filename", f"Notes_{target_deck_id[:8]}")
        deck_title = title or filename.rsplit(".", 1)[0]
        deck_doc = {
            "deck_id": target_deck_id,
            "title": deck_title,
            "document_id": target_doc_ids[0] if target_doc_ids else None,
            "document_ids": target_doc_ids,
            "user_id": user_id,
            "folder_id": folder_id,
            "flashcards": cards,
            "quizzes": quizzes,
            "cards_count": len(cards),
            "quizzes_count": len(quizzes),
            "mastery": 0,
            "color": "indigo",
            "hue": "bg-primary",
        }
        mongo_manager.save_deck(deck_doc)

    logger.info("Deck %s updated/created with %d cards and %d quizzes.", target_deck_id, len(cards), len(quizzes))

    task_id = getattr(getattr(task_self, "request", None), "id", f"deck_task_{target_deck_id}")
    return {
        "task_id": task_id,
        "deck_id": target_deck_id,
        "document_id": target_doc_ids[0] if target_doc_ids else "custom",
        "document_ids": target_doc_ids,
        "mode": mode,
        "status": "ready",
        "cards_count": len(cards),
        "quizzes_count": len(quizzes),
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
    document_id: Optional[str] = None,
    user_id: str = "user_default",
    mode: str = "both",
    deck_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    title: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Background task to run LangGraph generator graph and save resulting unified deck."""
    req_id = getattr(getattr(self, "request", None), "id", document_id or deck_id)
    logger.info("Starting deck generation task %s (Mode: %s, Doc: %s)...", req_id, mode, document_id)
    try:
        return execute_generate_deck(
            document_id=document_id,
            user_id=user_id,
            mode=mode,
            deck_id=deck_id,
            folder_id=folder_id,
            title=title,
            custom_prompt=custom_prompt,
            document_ids=document_ids,
            task_self=self,
        )
    except Exception as exc:
        logger.error("Deck generation task failed: %s", exc, exc_info=True)
        _safe_update_state(self, "FAILURE", {"error": str(exc)})
        return {"status": "failed", "error": str(exc), "document_id": document_id}

