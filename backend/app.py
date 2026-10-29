"""Application Factory and Static Serving Module for Mneme.

Configures Flask, PyMongo, QdrantClient, Celery, and registers the REST API.
Serves the built React SPA from ../frontend/dist with client-side catch-all routing.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Ensure backend root is in python path
current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

from api.routes import api_bp
from celery_app import celery_app
from config import settings
from services.database import mongo_manager
from services.llm_service import get_llm_service
from services.qdrant_service import qdrant_service

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("mneme.app")


def create_app() -> Flask:
    """Create and configure the production Flask application."""
    frontend_dist = settings.FRONTEND_DIST_DIR.resolve()

    logger.info("Initializing Mneme Flask Application...")
    logger.info("Frontend static distribution path: %s", frontend_dist)

    app = Flask(
        __name__,
        static_folder=str(frontend_dist),
        static_url_path="",
    )

    # Core Flask configurations
    app.config["SECRET_KEY"] = settings.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = settings.MAX_CONTENT_LENGTH
    app.config["UPLOAD_FOLDER"] = str(settings.UPLOAD_FOLDER)

    # Enable Cross-Origin Resource Sharing
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
    )

    # Attach Celery configuration
    app.config["broker_url"] = settings.CELERY_BROKER_URL
    app.config["result_backend"] = settings.CELERY_RESULT_BACKEND
    celery_app.conf.update(
        broker_url=settings.CELERY_BROKER_URL,
        result_backend=settings.CELERY_RESULT_BACKEND,
    )

    # Register API Blueprint
    app.register_blueprint(api_bp)

    # Verify Singleton LLM Service initialization in background or lazily
    logger.info("Ensuring Singleton LLM Service is initialized...")
    try:
        llm = get_llm_service()
        logger.info("LLM Service ready (fallback_mode=%s).", llm.fallback_mode)
    except Exception as exc:
        logger.warning("Eager LLM loading deferred: %s", exc)

    # ========================================================================
    # Static File & Single Page Application (SPA) Serving
    # ========================================================================

    @app.route("/", methods=["GET"])
    def serve_index() -> Any:
        """Serve the React Single Page Application root index.html."""
        if frontend_dist.exists() and (frontend_dist / "index.html").exists():
            return send_from_directory(str(frontend_dist), "index.html")

        # Fallback if frontend has not been compiled yet
        return jsonify({
            "app": "Mneme AI Active Recall Backend",
            "status": "online",
            "api_version": "v1",
            "message": "Frontend build not detected at ../frontend/dist. Please run 'npm run build' in /frontend.",
            "endpoints": [
                "/api/v1/health",
                "/api/v1/upload",
                "/api/v1/decks/generate",
                "/api/v1/tasks/<task_id>",
                "/api/v1/blurt/evaluate",
                "/api/v1/chat/stream",
            ],
        }), 200

    @app.route("/<path:path>", methods=["GET"])
    def serve_static_or_spa_fallback(path: str) -> Any:
        """Serve built static assets (JS, CSS, images) or fall back to index.html for React Router."""
        # Never route /api requests to SPA fallback
        if path.startswith("api/"):
            return jsonify({"error": "Endpoint not found"}), 404

        target_file = frontend_dist / path
        if frontend_dist.exists() and target_file.exists() and target_file.is_file():
            return send_from_directory(str(frontend_dist), path)

        # Catch-all fallback for client-side routing (e.g. /flashcards, /quiz, /blurt)
        if frontend_dist.exists() and (frontend_dist / "index.html").exists():
            return send_from_directory(str(frontend_dist), "index.html")

        return jsonify({"error": f"Asset '{path}' not found"}), 404

    # ========================================================================
    # Error Handlers
    # ========================================================================

    @app.errorhandler(404)
    def handle_404(e: Any) -> Any:
        if request.path.startswith("/api/"):
            return jsonify({"error": "Resource not found", "path": request.path}), 404
        if frontend_dist.exists() and (frontend_dist / "index.html").exists():
            return send_from_directory(str(frontend_dist), "index.html")
        return jsonify({"error": "Not Found"}), 404

    @app.errorhandler(500)
    def handle_500(e: Any) -> Any:
        logger.error("Unhandled internal server error: %s", e)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

    @app.errorhandler(413)
    def handle_413(e: Any) -> Any:
        return jsonify({"error": "File size exceeds the 50 MB limit"}), 413

    return app


app = create_app()

if __name__ == "__main__":
    logger.info("Starting Mneme HTTP Server on http://%s:%s", settings.HOST, settings.PORT)
    app.run(
        host=settings.HOST,
        port=settings.PORT,
        debug=settings.DEBUG,
    )
