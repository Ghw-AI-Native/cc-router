#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==============================="
echo "  cc-router"
echo "==============================="
echo ""

# Check Python
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo "[ERROR] Python not found. Install Python 3.10+."
    exit 1
fi

# Install dependencies (skip if already installed)
pip3 install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt -q

echo "Starting cc-router on http://127.0.0.1:8082"
echo "Press Ctrl+C to stop."
echo ""

exec "$PYTHON" router.py
