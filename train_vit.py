#!/usr/bin/env python3
"""Alias for train_waste_vit.py → backend/scripts/train_waste_vit.py (run from repo root)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
_SCRIPT = _ROOT / "backend" / "scripts" / "train_waste_vit.py"

if __name__ == "__main__":
    if not _SCRIPT.is_file():
        raise SystemExit(f"Missing {_SCRIPT}")
    sys.exit(subprocess.run([sys.executable, str(_SCRIPT), *sys.argv[1:]], cwd=str(_ROOT)).returncode)
