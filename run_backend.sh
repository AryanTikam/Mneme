#!/usr/bin/env bash
# Mneme Backend & Celery Worker Runner Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/.venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    VENV_PYTHON="python3"
fi

export PYTHONPATH="${SCRIPT_DIR}/backend:${PYTHONPATH}"
export FLASK_APP="${SCRIPT_DIR}/backend/app.py"

echo "=========================================================="
echo " Starting Mneme AI Active Recall Platform"
echo " Web UI:     http://localhost:5000"
echo " API Docs:   http://localhost:5000/api/v1/health"
echo " Python:     $(${VENV_PYTHON} --version)"
echo "=========================================================="

CELERY_BIN="${SCRIPT_DIR}/.venv/bin/celery"
CELERY_PID=""

cleanup() {
    echo ""
    echo "Stopping Mneme processes..."
    if [ -n "${CELERY_PID}" ] && kill -0 "${CELERY_PID}" 2>/dev/null; then
        echo "Stopping Celery worker (PID: ${CELERY_PID})..."
        kill -TERM "${CELERY_PID}" 2>/dev/null || true
        wait "${CELERY_PID}" 2>/dev/null || true
    fi
    echo "Done."
}

trap cleanup EXIT INT TERM

# Start Celery worker in the background if celery binary exists
if [ -f "${CELERY_BIN}" ]; then
    echo "Starting Celery worker for ingestion & batch generation..."
    "${CELERY_BIN}" -A celery_app.celery_app worker --loglevel=info --concurrency=2 &
    CELERY_PID=$!
    echo "Celery worker started (PID: ${CELERY_PID})."
fi

# Run Flask server in foreground
exec "${VENV_PYTHON}" "${SCRIPT_DIR}/backend/app.py"
