"""REST API Endpoints Blueprint for Mneme.

Implements all core middleware endpoints:
- POST /api/v1/upload (Async PDF ingestion)
- POST /api/v1/decks/generate (Async deck generation via LangGraph)
- GET /api/v1/tasks/<task_id> (Celery task status polling)
- POST /api/v1/blurt/evaluate (Synchronous semantic recall evaluation)
- POST /api/v1/chat/stream (SSE streaming for Socratic/Feynman tutor)
- Deck management & health checks
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Dict, Generator
from pathlib import Path

from celery.result import AsyncResult
from flask import Blueprint, Response, jsonify, request, stream_with_context
from werkzeug.utils import secure_filename

from celery_app import celery_app
from config import settings
from services.database import mongo_manager
from services.embedding_service import embedding_service
from services.llm_service import get_llm_service
from services.qdrant_service import qdrant_service
from tasks.celery_tasks import generate_deck_task, ingest_pdf_task
from workflows.blurt_graph import blurt_graph
from workflows.chat_graph import chat_graph, intent_router_node, retrieve_context_node

logger = logging.getLogger("mneme.api")

api_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")


def _get_request_user_id() -> str:
    """Extract authenticated user_id from headers or fall back to default tenant."""
    return request.headers.get("X-User-Id", settings.DEFAULT_USER_ID)


# ============================================================================
# 1. Document Upload & Ingestion Endpoint
# ============================================================================

@api_bp.route("/upload", methods=["POST"])
def upload_document() -> Response:
    """Accept PDF/documents (multipart/form-data) and queue Celery ingestion task.

    Returns:
        JSON with task_id, document_id, and status: 'queued'.
    """
    user_id = _get_request_user_id()

    if "file" not in request.files:
        return jsonify({"error": "No file part in upload request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename or "upload.pdf")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        return jsonify({
            "error": f"Unsupported file extension '{ext}'. Allowed: {settings.ALLOWED_EXTENSIONS}"
        }), 400

    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    save_path = settings.UPLOAD_FOLDER / f"{document_id}_{filename}"
    file.save(str(save_path))

    # Record initial document state in MongoDB
    mongo_manager.insert_document({
        "document_id": document_id,
        "user_id": user_id,
        "filename": filename,
        "status": "queued",
        "file_size": os.path.getsize(str(save_path)),
    })

    # Dispatch asynchronous background task via Celery
    try:
        task = ingest_pdf_task.delay(
            file_path=str(save_path),
            document_id=document_id,
            user_id=user_id,
            filename=filename,
        )
        task_id = task.id
    except Exception as exc:
        logger.warning("Celery broker unavailable (%s). Running ingestion synchronously as fallback.", exc)
        try:
            ingest_pdf_task.apply(args=[str(save_path), document_id, user_id, filename])
        except Exception as task_err:
            logger.error("Direct task execution error: %s", task_err)
        task_id = f"sync_{document_id}"

    return jsonify({
        "task_id": task_id,
        "document_id": document_id,
        "filename": filename,
        "status": "queued",
    }), 202


# ============================================================================
# 2. Deck Generation Endpoint
# ============================================================================

@api_bp.route("/decks/generate", methods=["POST"])
def generate_deck() -> Response:
    """Trigger background generation of Flashcards or Quiz items from notes.

    JSON payload:
        { "document_id": "...", "mode": "flashcards" | "quiz" }
    """
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}

    document_id = data.get("document_id")
    mode = data.get("mode", "flashcards")

    if not document_id:
        return jsonify({"error": "document_id is required"}), 400
    if mode not in ("flashcards", "quiz"):
        return jsonify({"error": "mode must be 'flashcards' or 'quiz'"}), 400

    # Dispatch Celery deck generation task
    try:
        task = generate_deck_task.delay(
            document_id=document_id,
            user_id=user_id,
            mode=mode,
        )
        task_id = task.id
    except Exception as exc:
        logger.warning("Celery broker unavailable (%s). Running deck generation synchronously.", exc)
        try:
            generate_deck_task.apply(args=[document_id, user_id, mode])
        except Exception as task_err:
            logger.error("Direct deck generation execution error: %s", task_err)
        task_id = f"sync_{document_id}_{mode}"

    return jsonify({
        "task_id": task_id,
        "document_id": document_id,
        "mode": mode,
        "status": "queued",
    }), 202


# ============================================================================
# 3. Task Status Polling Endpoint
# ============================================================================

@api_bp.route("/tasks/<task_id>", methods=["GET"])
def get_task_status(task_id: str) -> Response:
    """Poll the status and progress of a background Celery task."""
    if task_id.startswith("sync_"):
        return jsonify({
            "task_id": task_id,
            "status": "SUCCESS",
            "progress": 100,
            "result": {"status": "completed"},
        })

    try:
        result = AsyncResult(task_id, app=celery_app)
        response_data: Dict[str, Any] = {
            "task_id": task_id,
            "status": result.status,
        }

        if result.status == "PROGRESS":
            response_data["meta"] = result.info
        elif result.status == "SUCCESS":
            response_data["result"] = result.result
        elif result.status == "FAILURE":
            response_data["error"] = str(result.result)

        return jsonify(response_data)

    except Exception as exc:
        logger.error("Error querying task %s: %s", task_id, exc)
        return jsonify({"task_id": task_id, "status": "UNKNOWN", "error": str(exc)}), 500


# ============================================================================
# 4. Blurt Mode Evaluation Endpoint
# ============================================================================

@api_bp.route("/blurt/evaluate", methods=["POST"])
def evaluate_blurt() -> Response:
    """Synchronously evaluate student blurt text against document ground truth.

    JSON payload:
        { "document_id": "...", "blurt_text": "..." }

    Returns:
        JSON with 'recalled_concepts' and 'missed_concepts'.
    """
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}

    document_id = data.get("document_id")
    blurt_text = data.get("blurt_text", "").strip()

    if not blurt_text:
        return jsonify({"error": "blurt_text cannot be empty"}), 400

    try:
        initial_state = {
            "user_id": user_id,
            "document_id": document_id or "default",
            "blurt_text": blurt_text,
            "blurt_embedding": None,
            "retrieved_chunks": [],
            "recalled_concepts": [],
            "missed_concepts": [],
            "raw_llm_output": None,
        }

        # Run Blurt LangGraph workflow synchronously
        final_state = blurt_graph.invoke(initial_state)

        return jsonify({
            "recalled_concepts": final_state.get("recalled_concepts", []),
            "missed_concepts": final_state.get("missed_concepts", []),
        })

    except Exception as exc:
        logger.error("Blurt evaluation failed: %s", exc, exc_info=True)
        return jsonify({"error": f"Evaluation failed: {str(exc)}"}), 500


# ============================================================================
# 5. Unified Socratic & Feynman SSE Chat Stream Endpoint
# ============================================================================

@api_bp.route("/chat/stream", methods=["POST"])
def chat_stream() -> Response:
    """Stream AI Socratic/Feynman tutor response using Server-Sent Events (SSE).

    JSON payload:
        { "session_id": "...", "message": "...", "document_id": "..." }
    """
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id", str(uuid.uuid4()))
    user_message = data.get("message", "").strip()
    document_id = data.get("document_id")

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    def generate_sse() -> Generator[str, None, None]:
        """Generator yielding SSE data blocks."""
        try:
            # 1. Retrieve context
            chat_state = {
                "user_message": user_message,
                "chat_history": [],
                "retrieved_context": "",
                "intent_type": "",
                "ai_response": "",
                "user_id": user_id,
                "document_id": document_id,
                "session_id": session_id,
            }

            context_state = retrieve_context_node(chat_state)
            chat_state.update(context_state)

            # Signal searching stage to frontend
            yield f"data: {json.dumps({'stage': 'context_retrieved', 'intent': None, 'token': '', 'done': False})}\n\n"

            # 2. Determine Intent via lightweight IntentRouter
            intent_state = intent_router_node(chat_state)
            intent = intent_state.get("intent_type", "teach")
            chat_state["intent_type"] = intent

            yield f"data: {json.dumps({'stage': 'intent_classified', 'intent': intent, 'token': '', 'done': False})}\n\n"

            # 3. Formulate prompt for streaming response
            llm = get_llm_service()
            context = chat_state.get("retrieved_context", "")

            if intent == "ask":
                sys_inst = (
                    "You are Mneme's Socratic Recall Tutor. Answer the user's question using ONLY "
                    "the provided retrieved notes. Conclude with a gentle reflective question to deepen their insight."
                )
                prompt = (
                    f"STUDY NOTES CONTEXT:\n{context}\n\n"
                    f"USER QUESTION: {user_message}\n\n"
                    "Answer Socratically using ONLY the notes:"
                )
            else:
                sys_inst = (
                    "You are Richard Feynman. The student is explaining a concept to you like a 10-year-old. "
                    "If they use jargon, playfully ask them to translate to plain English. "
                    "If a key step is missing, ask a sharp question. If clear, validate their understanding enthusiastically!"
                )
                prompt = (
                    f"GROUND TRUTH CONTEXT:\n{context}\n\n"
                    f"STUDENT EXPLANATION: \"{user_message}\"\n\n"
                    "Provide your Feynman critique or validation:"
                )

            # 4. Stream tokens
            full_response = []
            for token in llm.generate_stream(prompt=prompt, system_prompt=sys_inst, max_new_tokens=512):
                full_response.append(token)
                payload = {
                    "token": token,
                    "intent": intent,
                    "done": False,
                }
                yield f"data: {json.dumps(payload)}\n\n"

            # 5. Final completion event
            completed_text = "".join(full_response).strip()
            final_payload = {
                "token": "",
                "intent": intent,
                "done": True,
                "full_text": completed_text,
            }
            yield f"data: {json.dumps(final_payload)}\n\n"

        except Exception as exc:
            logger.error("SSE Streaming exception: %s", exc, exc_info=True)
            err_payload = {"error": str(exc), "done": True}
            yield f"data: {json.dumps(err_payload)}\n\n"

    response = Response(stream_with_context(generate_sse()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


# ============================================================================
# 6. Decks and Documents Convenience Endpoints
# ============================================================================

@api_bp.route("/decks", methods=["GET"])
def list_decks() -> Response:
    """Retrieve all flashcard/quiz decks for the current user."""
    user_id = _get_request_user_id()
    decks = mongo_manager.list_decks(user_id)
    return jsonify({"decks": decks})


@api_bp.route("/decks/<deck_id>", methods=["GET"])
def get_deck(deck_id: str) -> Response:
    """Retrieve details and items for a specific deck."""
    user_id = _get_request_user_id()
    deck = mongo_manager.get_deck(deck_id, user_id)
    if not deck:
        return jsonify({"error": "Deck not found"}), 404
    return jsonify({"deck": deck})


@api_bp.route("/decks/<deck_id>/review", methods=["POST"])
def record_deck_review(deck_id: str) -> Response:
    """Record an active recall spaced-repetition rating (1-5) for a card."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}

    card_id = data.get("card_id")
    rating = data.get("rating", 3)
    interval = data.get("interval_days", 1)

    if not card_id:
        return jsonify({"error": "card_id is required"}), 400

    mongo_manager.record_review(
        user_id=user_id,
        card_id=card_id,
        deck_id=deck_id,
        rating=rating,
        recall_interval_days=interval,
    )
    return jsonify({"status": "recorded", "card_id": card_id, "rating": rating})


@api_bp.route("/documents", methods=["GET"])
def list_documents() -> Response:
    """List uploaded documents for the current user."""
    user_id = _get_request_user_id()
    docs = mongo_manager.list_documents(user_id)
    return jsonify({"documents": docs})


# ============================================================================
# 7. System Health Endpoint
# ============================================================================

@api_bp.route("/health", methods=["GET"])
def health_check() -> Response:
    """Diagnostic endpoint checking statuses of MongoDB, Qdrant, Redis, and LLM."""
    llm = get_llm_service()
    status = {
        "status": "healthy",
        "mongodb_connected": mongo_manager.is_connected,
        "qdrant_connected": qdrant_service.is_connected,
        "llm_loaded": llm.is_loaded,
        "llm_fallback_mode": llm.fallback_mode,
        "model_name": settings.MODEL_NAME,
    }
    return jsonify(status)
