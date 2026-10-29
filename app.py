"""Root entry point for Mneme Backend.

Allows running `python app.py` or importing `app` directly from repository root.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# Ensure backend directory is in python search path
root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Explicit module loading to avoid shadowing
_backend_app_path = backend_dir / "app.py"
_spec = importlib.util.spec_from_file_location("backend_app_module", str(_backend_app_path))
if _spec and _spec.loader:
    _backend_module = importlib.util.module_from_spec(_spec)
    sys.modules["backend_app_module"] = _backend_module
    _spec.loader.exec_module(_backend_module)
    create_app = _backend_module.create_app
    app = _backend_module.app
else:
    raise ImportError("Could not load backend application from backend/app.py")

from config import settings  # noqa: E402

if __name__ == "__main__":
    app.run(
        host=settings.HOST,
        port=settings.PORT,
        debug=settings.DEBUG,
    )
