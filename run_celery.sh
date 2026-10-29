#!/usr/bin/env bash
# Mneme Celery Worker Runner Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_CELERY="${SCRIPT_DIR}/.venv/bin/celery"

if [ ! -f "${VENV_CELERY}" ]; then
    VENV_CELERY="celery"
fi

export PYTHONPATH="${SCRIPT_DIR}/backend:${PYTHONPATH}"

echo "=========================================================="
echo " Starting Mneme Celery Worker"
echo " Broker:     redis://localhost:6379/0"
echo " Tasks:      mneme.ingest_pdf, mneme.generate_deck"
echo "=========================================================="

cd "${SCRIPT_DIR}/backend"
exec "${VENV_CELERY}" -A celery_app.celery_app worker --loglevel=info --concurrency=2

