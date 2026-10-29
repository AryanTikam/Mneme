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
from typing import Any, Dict, List

from celery_app import celery_app
from config import settings
from services.database import mongo_manager
from services.embedding_service import embedding_service
from services.qdrant_service import qdrant_service
from workflows.generator_graph import generator_graph

logger = logging.getLogger("mneme.tasks")


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


@celery_app.task(bind=True, name="mneme.ingest_pdf")
def ingest_pdf_task(
    self: Any,
    file_path: str,
    document_id: str,
    user_id: str,
    filename: str,
) -> Dict[str, Any]:
    """Background task to extract text, chunk via LangChain, embed and save to Qdrant."""
    logger.info("Starting ingestion task %s for doc %s (User %s)...", self.request.id, document_id, user_id)
    self.update_state(state="PROGRESS", meta={"step": "extracting", "progress": 20})

    try:
        mongo_manager.update_document_status(document_id, "extracting")

        # 1. Text extraction
        extracted_text = _extract_text_from_file(file_path)
        if not extracted_text.strip():
            raise ValueError("Extracted document text is empty.")

        self.update_state(state="PROGRESS", meta={"step": "chunking", "progress": 45})

        # 2. Semantic text chunking using LangChain
        from langchain.text_splitter import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=150,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks = splitter.split_text(extracted_text)
        logger.info("Split document %s into %d semantic chunks.", document_id, len(chunks))

        self.update_state(state="PROGRESS", meta={"step": "vectorizing", "progress": 70})
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
        self.update_state(state="PROGRESS", meta={"step": "saving", "progress": 95})
        mongo_manager.update_document_status(
            document_id,
            "ready",
            {
                "chunk_count": len(chunks),
                "total_chars": len(extracted_text),
                "summary": extracted_text[:300] + "...",
            },
        )

        # Clean up temporary uploaded file
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass

        logger.info("Ingestion complete for document %s.", document_id)
        return {
            "task_id": self.request.id,
            "document_id": document_id,
            "user_id": user_id,
            "status": "ready",
            "chunk_count": len(chunks),
        }

    except Exception as exc:
        logger.error("Ingestion task failed for document %s: %s", document_id, exc, exc_info=True)
        mongo_manager.update_document_status(document_id, "failed", {"error": str(exc)})
        self.update_state(state="FAILURE", meta={"error": str(exc)})
        raise exc


@celery_app.task(bind=True, name="mneme.generate_deck")
def generate_deck_task(
    self: Any,
    document_id: str,
    user_id: str,
    mode: str = "flashcards",
) -> Dict[str, Any]:
    """Background task to run LangGraph generator graph and save resulting deck."""
    logger.info("Starting deck generation task %s (Mode: %s, Doc: %s)...", self.request.id, mode, document_id)
    self.update_state(state="PROGRESS", meta={"step": "generating", "progress": 30})

    try:
        # Retrieve document text from Qdrant or MongoDB
        doc_record = mongo_manager.get_document(document_id, user_id)
        if not doc_record:
            raise ValueError(f"Document {document_id} not found for user {user_id}")

        # Fetch representative chunks for context
        chunks = qdrant_service.search_chunks(
            user_id=user_id,
            query_vector=embedding_service.embed_text("key concepts principles definitions"),
            top_k=8,
            document_id=document_id,
        )

        if chunks:
            source_text = "\n\n".join(c.get("text", "") for c in chunks)
        else:
            source_text = doc_record.get("summary", "General course overview.")

        self.update_state(state="PROGRESS", meta={"step": "graph_execution", "progress": 60})

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
        title = doc_record.get("filename", "Study Material").rsplit(".", 1)[0]
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

        return {
            "task_id": self.request.id,
            "deck_id": deck_id,
            "document_id": document_id,
            "mode": mode,
            "status": "ready",
            "cards_count": len(items),
        }

    except Exception as exc:
        logger.error("Deck generation task failed: %s", exc, exc_info=True)
        self.update_state(state="FAILURE", meta={"error": str(exc)})
        raise exc

