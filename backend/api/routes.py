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
from concurrent.futures import ThreadPoolExecutor
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
from tasks.celery_tasks import (
    execute_generate_deck,
    execute_ingest,
    generate_deck_task,
    ingest_pdf_task,
)
from workflows.blurt_graph import blurt_graph
from workflows.chat_graph import chat_graph, intent_router_node, retrieve_context_node

logger = logging.getLogger("mneme.api")

api_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")

_task_executor = ThreadPoolExecutor(max_workers=4)
_in_memory_task_status: Dict[str, Dict[str, Any]] = {}


def _is_celery_worker_active() -> bool:
    """Check if any Celery worker is currently live and receiving tasks."""
    try:
        pings = celery_app.control.ping(timeout=0.3)
        return bool(pings)
    except Exception:
        return False


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

    # Dispatch via Celery worker if available, or background thread fallback
    if _is_celery_worker_active():
        try:
            task = ingest_pdf_task.delay(
                file_path=str(save_path),
                document_id=document_id,
                user_id=user_id,
                filename=filename,
            )
            task_id = task.id
            logger.info("Queued ingestion via Celery worker: task_id=%s", task_id)
        except Exception as exc:
            logger.warning("Celery dispatch error (%s). Running in background thread pool.", exc)
            task_id = f"bg_{uuid.uuid4().hex[:12]}"
            _in_memory_task_status[task_id] = {"status": "PROGRESS", "progress": 20}

            def _run_bg_ingest():
                try:
                    res = execute_ingest(str(save_path), document_id, user_id, filename)
                    _in_memory_task_status[task_id] = {"status": "SUCCESS", "progress": 100, "result": res}
                except Exception as err:
                    logger.error("Background ingestion failed: %s", err)
                    _in_memory_task_status[task_id] = {"status": "FAILURE", "error": str(err)}

            _task_executor.submit(_run_bg_ingest)
    else:
        logger.info("No active Celery worker found. Running ingestion in background thread pool.")
        task_id = f"bg_{uuid.uuid4().hex[:12]}"
        _in_memory_task_status[task_id] = {"status": "PROGRESS", "progress": 20}

        def _run_bg_ingest():
            try:
                res = execute_ingest(str(save_path), document_id, user_id, filename)
                _in_memory_task_status[task_id] = {"status": "SUCCESS", "progress": 100, "result": res}
            except Exception as err:
                logger.error("Background ingestion failed: %s", err)
                _in_memory_task_status[task_id] = {"status": "FAILURE", "error": str(err)}

        _task_executor.submit(_run_bg_ingest)

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
    """Trigger background generation of Flashcards and/or Quiz items into a unified deck.

    JSON payload:
        {
            "document_id": "...",
            "mode": "both" | "flashcards" | "quiz",
            "deck_id": "..." (optional, appends to existing deck),
            "folder_id": "..." (optional),
            "title": "..." (optional),
            "prompt": "..." (optional topic guidance)
        }
    """
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}

    document_id = data.get("document_id")
    mode = data.get("mode", "both")
    deck_id = data.get("deck_id")
    folder_id = data.get("folder_id")
    title = data.get("title")
    custom_prompt = data.get("prompt")

    if not document_id and not custom_prompt:
        return jsonify({"error": "document_id or prompt is required"}), 400
    if mode not in ("both", "flashcards", "quiz"):
        return jsonify({"error": "mode must be 'both', 'flashcards', or 'quiz'"}), 400

    # Dispatch via Celery worker if available, or background thread fallback
    if _is_celery_worker_active():
        try:
            task = generate_deck_task.delay(
                document_id=document_id or "custom",
                user_id=user_id,
                mode=mode,
                deck_id=deck_id,
                folder_id=folder_id,
                title=title,
                custom_prompt=custom_prompt,
            )
            task_id = task.id
            logger.info("Queued deck generation via Celery worker: task_id=%s", task_id)
        except Exception as exc:
            logger.warning("Celery dispatch error (%s). Running in background thread pool.", exc)
            task_id = f"bg_{uuid.uuid4().hex[:12]}"
            _in_memory_task_status[task_id] = {"status": "PROGRESS", "progress": 30}

            def _run_bg_deck():
                try:
                    res = execute_generate_deck(
                        document_id=document_id or "custom",
                        user_id=user_id,
                        mode=mode,
                        deck_id=deck_id,
                        folder_id=folder_id,
                        title=title,
                        custom_prompt=custom_prompt,
                    )
                    _in_memory_task_status[task_id] = {"status": "SUCCESS", "progress": 100, "result": res}
                except Exception as err:
                    logger.error("Background deck generation failed: %s", err)
                    _in_memory_task_status[task_id] = {"status": "FAILURE", "error": str(err)}

            _task_executor.submit(_run_bg_deck)
    else:
        logger.info("No active Celery worker found. Running deck generation in background thread pool.")
        task_id = f"bg_{uuid.uuid4().hex[:12]}"
        _in_memory_task_status[task_id] = {"status": "PROGRESS", "progress": 30}

        def _run_bg_deck():
            try:
                res = execute_generate_deck(
                    document_id=document_id or "custom",
                    user_id=user_id,
                    mode=mode,
                    deck_id=deck_id,
                    folder_id=folder_id,
                    title=title,
                    custom_prompt=custom_prompt,
                )
                _in_memory_task_status[task_id] = {"status": "SUCCESS", "progress": 100, "result": res}
            except Exception as err:
                logger.error("Background deck generation failed: %s", err)
                _in_memory_task_status[task_id] = {"status": "FAILURE", "error": str(err)}

        _task_executor.submit(_run_bg_deck)

    return jsonify({
        "task_id": task_id,
        "document_id": document_id,
        "mode": mode,
        "deck_id": deck_id,
        "status": "queued",
    }), 202


# ============================================================================
# 3. Task Status Polling Endpoint
# ============================================================================

@api_bp.route("/tasks/<task_id>", methods=["GET"])
def get_task_status(task_id: str) -> Response:
    """Poll the status and progress of a background Celery or fallback task."""
    if task_id.startswith("sync_"):
        return jsonify({
            "task_id": task_id,
            "status": "SUCCESS",
            "progress": 100,
            "result": {"status": "completed"},
        })

    if task_id in _in_memory_task_status:
        info = _in_memory_task_status[task_id]
        return jsonify({
            "task_id": task_id,
            **info,
        })

    try:
        result = AsyncResult(task_id, app=celery_app)
        try:
            status = result.status
        except Exception:
            status = getattr(result, "state", "PENDING")

        response_data: Dict[str, Any] = {
            "task_id": task_id,
            "status": status,
        }

        if status == "PROGRESS":
            response_data["meta"] = getattr(result, "info", {})
        elif status == "SUCCESS":
            response_data["result"] = getattr(result, "result", None)
        elif status == "FAILURE":
            try:
                response_data["error"] = str(result.result)
            except Exception:
                response_data["error"] = "Task failed during execution"

        return jsonify(response_data)

    except Exception as exc:
        logger.error("Error querying task %s: %s", task_id, exc)
        return jsonify({"task_id": task_id, "status": "FAILURE", "error": str(exc)}), 200


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
# 6. User Management & Auth Endpoints
# ============================================================================

@api_bp.route("/auth/register", methods=["POST"])
def auth_register() -> Response:
    """Register a new user account with password."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    name = data.get("name", "").strip() or None
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    try:
        user = mongo_manager.register_user(username, password, name=name)
        logger.info("User registered: %s (%s)", user["username"], user["user_id"])
        return jsonify({"user": user}), 201
    except ValueError as err:
        return jsonify({"error": str(err)}), 409


@api_bp.route("/auth/login", methods=["POST"])
def auth_login() -> Response:
    """Authenticate user by username and password."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = mongo_manager.authenticate_user(username, password)
    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    logger.info("User authenticated: %s (%s)", user.get("username"), user.get("user_id"))
    return jsonify({"user": user})


@api_bp.route("/auth/profile", methods=["DELETE"])
def auth_delete_profile() -> Response:
    """Permanently delete user profile and all associated data."""
    user_id = _get_request_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    mongo_manager.delete_user_account(user_id)
    return jsonify({"status": "deleted", "user_id": user_id})


@api_bp.route("/auth/me", methods=["GET"])
def auth_me() -> Response:
    """Retrieve current authenticated user profile."""
    user_id = _get_request_user_id()
    user = mongo_manager.get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user})


@api_bp.route("/users", methods=["GET"])
def list_users() -> Response:
    """Restricted: Private instances do not expose public user lists."""
    return jsonify({"users": []})


# ============================================================================
# 7. Folder Management Endpoints
# ============================================================================

@api_bp.route("/folders", methods=["GET"])
def list_folders() -> Response:
    """Retrieve all folders for current user."""
    user_id = _get_request_user_id()
    folders = mongo_manager.list_folders(user_id)
    return jsonify({"folders": folders})


@api_bp.route("/folders", methods=["POST"])
def create_folder() -> Response:
    """Create a new folder for organizing decks."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    folder_id = f"folder_{uuid.uuid4().hex[:10]}"
    folder_doc = {
        "folder_id": folder_id,
        "user_id": user_id,
        "name": name,
        "color": data.get("color", "indigo"),
        "order": data.get("order", 0),
    }
    mongo_manager.create_folder(folder_doc)
    logger.info("Created folder '%s' (%s) for user %s", name, folder_id, user_id)
    return jsonify({"folder": folder_doc}), 201


@api_bp.route("/folders/<folder_id>", methods=["PUT"])
def update_folder(folder_id: str) -> Response:
    """Rename or update color/order of a folder."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    updates = {k: v for k, v in data.items() if k in ("name", "color", "order")}
    success = mongo_manager.update_folder(folder_id, user_id, updates)
    if not success:
        return jsonify({"error": "Folder not found"}), 404
    updated = mongo_manager.get_folder(folder_id, user_id)
    return jsonify({"folder": updated})


@api_bp.route("/folders/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id: str) -> Response:
    """Delete a folder and uncouple its decks."""
    user_id = _get_request_user_id()
    mongo_manager.delete_folder(folder_id, user_id)
    return jsonify({"status": "deleted", "folder_id": folder_id})


# ============================================================================
# 8. Unified Decks and Document Endpoints
# ============================================================================

@api_bp.route("/decks", methods=["GET"])
def list_decks() -> Response:
    """Retrieve unified decks for the current user with search, filter, and sort."""
    user_id = _get_request_user_id()
    folder_id = request.args.get("folder_id")
    search = request.args.get("search")
    sort_by = request.args.get("sort_by")

    decks = mongo_manager.list_decks(
        user_id=user_id,
        folder_id=folder_id,
        search=search,
        sort_by=sort_by,
    )
    return jsonify({"decks": decks})


@api_bp.route("/decks", methods=["POST"])
def create_deck() -> Response:
    """Manually create a new empty or initial unified deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip() or "Untitled Deck"
    folder_id = data.get("folder_id")
    color = data.get("color", "indigo")

    deck_id = f"deck_{uuid.uuid4().hex[:12]}"
    document_ids = data.get("document_ids", [])
    if isinstance(document_ids, str):
        document_ids = [document_ids]
    primary_doc_id = document_ids[0] if document_ids else data.get("document_id")

    deck_doc = {
        "deck_id": deck_id,
        "user_id": user_id,
        "title": title,
        "folder_id": folder_id if folder_id and folder_id != "unorganized" else None,
        "color": color,
        "document_id": primary_doc_id,
        "document_ids": document_ids or ([primary_doc_id] if primary_doc_id else []),
        "flashcards": data.get("flashcards", []),
        "quizzes": data.get("quizzes", []),
        "order": data.get("order", 0),
        "mastery": 0,
    }
    mongo_manager.save_deck(deck_doc)
    logger.info("Created new deck '%s' (%s) for user %s", title, deck_id, user_id)
    return jsonify({"deck": mongo_manager.get_deck(deck_id, user_id)}), 201


@api_bp.route("/decks/<deck_id>", methods=["GET"])
def get_deck(deck_id: str) -> Response:
    """Retrieve details and items for a specific deck."""
    user_id = _get_request_user_id()
    deck = mongo_manager.get_deck(deck_id, user_id)
    if not deck:
        return jsonify({"error": "Deck not found"}), 404
    return jsonify({"deck": deck})


@api_bp.route("/decks/<deck_id>", methods=["PUT"])
def update_deck(deck_id: str) -> Response:
    """Update deck metadata (title, folder_id, color, order, document_ids)."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    allowed = ("title", "folder_id", "color", "order", "document_ids", "document_id")
    updates = {k: v for k, v in data.items() if k in allowed}
    if "folder_id" in updates and updates["folder_id"] in ("unorganized", ""):
        updates["folder_id"] = None

    success = mongo_manager.update_deck(deck_id, user_id, updates)
    if not success:
        return jsonify({"error": "Deck not found"}), 404
    return jsonify({"deck": mongo_manager.get_deck(deck_id, user_id)})


@api_bp.route("/decks/<deck_id>/move", methods=["PUT"])
def move_deck(deck_id: str) -> Response:
    """Move deck into a folder or reorder (drag & drop handler)."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    folder_id = data.get("folder_id")
    order = data.get("order")
    success = mongo_manager.move_deck(deck_id, user_id, folder_id, order)
    if not success:
        return jsonify({"error": "Deck not found"}), 404
    return jsonify({"status": "moved", "deck_id": deck_id, "folder_id": folder_id, "order": order})


@api_bp.route("/decks/<deck_id>", methods=["DELETE"])
def delete_deck(deck_id: str) -> Response:
    """Delete a unified deck for the current user (idempotent)."""
    user_id = _get_request_user_id()
    deleted = mongo_manager.delete_deck(deck_id, user_id)
    logger.info("Deleted deck %s for user %s (existed: %s)", deck_id, user_id, deleted)
    return jsonify({"status": "deleted", "deck_id": deck_id})


# ============================================================================
# 9. Individual Card and Quiz Management within a Deck
# ============================================================================

@api_bp.route("/decks/<deck_id>/cards", methods=["POST"])
def add_card_to_deck(deck_id: str) -> Response:
    """Add a single new flashcard to a deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    front = data.get("front", "").strip()
    back = data.get("back", "").strip()
    if not front or not back:
        return jsonify({"error": "front and back are required"}), 400

    card = mongo_manager.add_card(deck_id, user_id, {"front": front, "back": back})
    if not card:
        return jsonify({"error": "Deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"card": card, "deck": updated_deck}), 201


@api_bp.route("/decks/<deck_id>/cards/<card_id>", methods=["PUT"])
def update_card_in_deck(deck_id: str, card_id: str) -> Response:
    """Update a flashcard within a deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    card = mongo_manager.update_card(deck_id, user_id, card_id, data)
    if not card:
        return jsonify({"error": "Card or deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"card": card, "deck": updated_deck})


@api_bp.route("/decks/<deck_id>/cards/<card_id>", methods=["DELETE"])
def delete_card_from_deck(deck_id: str, card_id: str) -> Response:
    """Delete a flashcard from a deck."""
    user_id = _get_request_user_id()
    success = mongo_manager.delete_card(deck_id, user_id, card_id)
    if not success:
        return jsonify({"error": "Card or deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"status": "deleted", "card_id": card_id, "deck": updated_deck})


@api_bp.route("/decks/<deck_id>/quizzes", methods=["POST"])
def add_quiz_to_deck(deck_id: str) -> Response:
    """Add a single new quiz question to a deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    options = data.get("options", [])
    answer = data.get("answer", 0)
    explanation = data.get("explanation", "").strip()

    if not question or not options:
        return jsonify({"error": "question and options are required"}), 400

    quiz = mongo_manager.add_quiz(
        deck_id, user_id,
        {"question": question, "options": options, "answer": answer, "explanation": explanation}
    )
    if not quiz:
        return jsonify({"error": "Deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"quiz": quiz, "deck": updated_deck}), 201


@api_bp.route("/decks/<deck_id>/quizzes/<quiz_id>", methods=["PUT"])
def update_quiz_in_deck(deck_id: str, quiz_id: str) -> Response:
    """Update a quiz question within a deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    quiz = mongo_manager.update_quiz(deck_id, user_id, quiz_id, data)
    if not quiz:
        return jsonify({"error": "Quiz or deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"quiz": quiz, "deck": updated_deck})


@api_bp.route("/decks/<deck_id>/quizzes/<quiz_id>", methods=["DELETE"])
def delete_quiz_from_deck(deck_id: str, quiz_id: str) -> Response:
    """Delete a quiz question from a deck."""
    user_id = _get_request_user_id()
    success = mongo_manager.delete_quiz(deck_id, user_id, quiz_id)
    if not success:
        return jsonify({"error": "Quiz or deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    return jsonify({"status": "deleted", "quiz_id": quiz_id, "deck": updated_deck})


@api_bp.route("/decks/<deck_id>/contexts", methods=["GET"])
def get_deck_contexts(deck_id: str) -> Response:
    """List document contexts attached to this deck and available user documents."""
    user_id = _get_request_user_id()
    deck = mongo_manager.get_deck(deck_id, user_id)
    if not deck:
        return jsonify({"error": "Deck not found"}), 404

    attached = mongo_manager.get_deck_documents(deck_id, user_id)
    all_docs = mongo_manager.list_documents(user_id)
    attached_ids = {d["document_id"] for d in attached}
    available = [d for d in all_docs if d.get("document_id") not in attached_ids]

    return jsonify({
        "deck_id": deck_id,
        "attached_documents": attached,
        "available_documents": available,
        "all_documents": all_docs,
    })


@api_bp.route("/decks/<deck_id>/contexts/attach", methods=["POST"])
def attach_context_to_deck(deck_id: str) -> Response:
    """Attach an existing uploaded document context to this deck."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    document_id = data.get("document_id")
    if not document_id:
        return jsonify({"error": "document_id is required"}), 400

    ok = mongo_manager.attach_document_to_deck(deck_id, user_id, document_id)
    if not ok:
        return jsonify({"error": "Deck or document not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    attached = mongo_manager.get_deck_documents(deck_id, user_id)
    return jsonify({"status": "attached", "deck": updated_deck, "attached_documents": attached})


@api_bp.route("/decks/<deck_id>/contexts/detach", methods=["POST"])
def detach_context_from_deck(deck_id: str) -> Response:
    """Detach a document context from this deck without deleting the document."""
    user_id = _get_request_user_id()
    data = request.get_json(silent=True) or {}
    document_id = data.get("document_id")
    if not document_id:
        return jsonify({"error": "document_id is required"}), 400

    ok = mongo_manager.detach_document_from_deck(deck_id, user_id, document_id)
    if not ok:
        return jsonify({"error": "Deck not found"}), 404
    updated_deck = mongo_manager.get_deck(deck_id, user_id)
    attached = mongo_manager.get_deck_documents(deck_id, user_id)
    return jsonify({"status": "detached", "deck": updated_deck, "attached_documents": attached})


@api_bp.route("/decks/<deck_id>/contexts/upload", methods=["POST"])
def upload_context_to_deck(deck_id: str) -> Response:
    """Upload a study file directly into this deck's context library."""
    user_id = _get_request_user_id()
    deck = mongo_manager.get_deck(deck_id, user_id)
    if not deck:
        return jsonify({"error": "Deck not found"}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Filename is empty"}), 400

    from werkzeug.utils import secure_filename
    from config import settings
    safe_filename = secure_filename(file.filename)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    saved_path = settings.UPLOAD_FOLDER / f"{document_id}_{safe_filename}"
    file.save(str(saved_path))

    mongo_manager.insert_document({
        "document_id": document_id,
        "user_id": user_id,
        "filename": safe_filename,
        "status": "ready",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        from tasks.celery_tasks import execute_ingest
        execute_ingest(str(saved_path), document_id, user_id, safe_filename)
        mongo_manager.attach_document_to_deck(deck_id, user_id, document_id)
        updated_deck = mongo_manager.get_deck(deck_id, user_id)
        attached = mongo_manager.get_deck_documents(deck_id, user_id)
        return jsonify({
            "status": "uploaded",
            "document_id": document_id,
            "deck": updated_deck,
            "attached_documents": attached,
        })
    except Exception as exc:
        logger.error("Failed to ingest context upload for deck %s: %s", deck_id, exc)
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/decks/<deck_id>/generate-more", methods=["POST"])
def generate_more_for_deck(deck_id: str) -> Response:
    """AI generate additional flashcards or quiz items for an existing deck using attached contexts."""
    user_id = _get_request_user_id()
    deck = mongo_manager.get_deck(deck_id, user_id)
    if not deck:
        return jsonify({"error": "Deck not found"}), 404

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "both")
    custom_prompt = data.get("prompt")
    document_ids = data.get("document_ids") or deck.get("document_ids") or []
    document_id = deck.get("document_id") or (document_ids[0] if document_ids else "custom")

    # Run generation across all target document contexts
    try:
        res = execute_generate_deck(
            document_id=document_id,
            user_id=user_id,
            mode=mode,
            deck_id=deck_id,
            custom_prompt=custom_prompt,
            document_ids=document_ids,
        )
        updated = mongo_manager.get_deck(deck_id, user_id)
        return jsonify({"status": "ready", "result": res, "deck": updated})
    except Exception as exc:
        logger.error("Generate more failed for deck %s: %s", deck_id, exc)
        return jsonify({"error": str(exc)}), 500


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


@api_bp.route("/documents/<document_id>", methods=["DELETE"])
def delete_document(document_id: str) -> Response:
    """Delete an uploaded document and its associated decks/vectors (idempotent)."""
    user_id = _get_request_user_id()
    deleted = mongo_manager.delete_document(document_id, user_id)
    logger.info("Deleted document %s and associated decks for user %s (existed: %s)", document_id, user_id, deleted)
    return jsonify({"status": "deleted", "document_id": document_id})


# ============================================================================
# 10. System Health Endpoint
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
        "model_name": llm.model_name,
    }
    return jsonify(status)
