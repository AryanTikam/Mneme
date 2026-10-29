#!/usr/bin/env bash
# Mneme Backend Runner Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/.venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    VENV_PYTHON="python3"
fi

export PYTHONPATH="${SCRIPT_DIR}/backend:${PYTHONPATH}"
export FLASK_APP="${SCRIPT_DIR}/backend/app.py"

echo "=========================================================="
echo " Starting Mneme AI Active Recall Backend"
echo " Web UI:     http://localhost:5000"
echo " API Docs:   http://localhost:5000/api/v1/health"
echo " Python:     $(${VENV_PYTHON} --version)"
echo "=========================================================="

exec "${VENV_PYTHON}" "${SCRIPT_DIR}/backend/app.py"

