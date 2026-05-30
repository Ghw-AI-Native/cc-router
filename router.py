"""cc-router — lightweight proxy with intelligent image routing + Web management panel."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx
import uvicorn
import yaml
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, HTMLResponse, Response, StreamingResponse, FileResponse
from starlette.routing import Route

from config import ConfigManager, PROVIDER_PRESETS
from core import detect_images, forward, connect_stream, iter_stream_bytes, TIMEOUT

# ── Globals ─────────────────────────────────────────────────────────
config_mgr = ConfigManager()
start_time = time.monotonic()
stats: dict[str, int] = {"text": 0, "multimodal": 0, "errors": 0}
activity_log: list[dict[str, Any]] = []  # Last 50 routing decisions
MAX_LOG = 50

logger = logging.getLogger("cc-router")


def _record(route: str, has_image: bool, source_model: str, target_model: str, backend_name: str, status: int) -> None:
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%H:%M:%S")
    activity_log.append({
        "time": now, "route": route, "has_image": has_image,
        "source_model": source_model, "target_model": target_model,
        "backend": backend_name, "status": status,
    })
    if len(activity_log) > MAX_LOG:
        activity_log.pop(0)


# ── Route handlers ──────────────────────────────────────────────────


async def messages(req: Request) -> StreamingResponse | JSONResponse:
    """POST /v1/messages — main proxy endpoint."""
    client: httpx.AsyncClient = req.app.state.client
    cfg = config_mgr.config

    try:
        body: dict[str, Any] = await req.json()
    except (json.JSONDecodeError, ValueError):
        stats["errors"] += 1
        return JSONResponse({"error": "Invalid request body"}, status_code=400)

    has_image = detect_images(body)
    backend = cfg.multimodal if has_image else cfg.text
    route_label = "multimodal" if has_image else "text"
    stats[route_label] += 1

    source_model = str(body.get("model", "?"))
    client_version = req.headers.get("anthropic-version", "2023-06-01")

    logger.info("→ %s | has_image=%s | %s → %s (%s)", route_label, has_image, source_model, backend.model, backend.name)

    is_stream = body.get("stream", False)

    try:
        if is_stream:
            resp, _proxy_body = await connect_stream(client, backend, body, client_version)
            proxy_headers = {"x-cc-router-backend": backend.provider, "x-cc-router-route": route_label}
            if resp.status_code != 200:
                error_body = await resp.aread()
                _record(route_label, has_image, source_model, backend.model, backend.name, resp.status_code)
                return Response(content=error_body, status_code=resp.status_code, media_type="application/json", headers=proxy_headers)
            _record(route_label, has_image, source_model, backend.model, backend.name, 200)
            return StreamingResponse(iter_stream_bytes(resp), media_type="text/event-stream", headers=proxy_headers)

        status_code, resp_headers, resp_body = await forward(client, backend, body, client_version)

        proxy_headers = {
            k: v for k, v in resp_headers.items()
            if k.lower() not in {"transfer-encoding", "content-encoding", "content-length"}
        }
        proxy_headers["x-cc-router-backend"] = backend.provider
        proxy_headers["x-cc-router-route"] = route_label

        _record(route_label, has_image, source_model, backend.model, backend.name, status_code)
        return Response(content=resp_body, status_code=status_code, headers=proxy_headers, media_type="application/json")
    except Exception as exc:
        stats["errors"] += 1
        _record(route_label, has_image, source_model, backend.model, backend.name, 502)
        logger.error("Proxy error: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=502)


async def health(req: Request) -> JSONResponse:
    """GET /health — machine-readable health check."""
    return JSONResponse({"status": "ok", "uptime": int(time.monotonic() - start_time)})


# ── API endpoints ───────────────────────────────────────────────────


async def api_config_get(req: Request) -> JSONResponse:
    """GET /api/config — return config.yaml content."""
    path = config_mgr._path
    try:
        content = path.read_text(encoding="utf-8")
        return JSONResponse({"content": content, "mtime": path.stat().st_mtime})
    except OSError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_config_post(req: Request) -> JSONResponse:
    """POST /api/config — save config.yaml (validates YAML first)."""
    try:
        payload = await req.json()
        content = payload.get("content", "")
        if content is None:
            content = ""
        if not content.strip():
            return JSONResponse({"ok": False, "error": "Content is empty"}, status_code=400)
        # Validate YAML syntax + schema
        parsed = yaml.safe_load(content)
        if not isinstance(parsed, dict):
            return JSONResponse({"ok": False, "error": "Config must be a YAML mapping"}, status_code=400)
        if "text" not in parsed:
            return JSONResponse({"ok": False, "error": "Missing required section: text"}, status_code=400)
        if "multimodal" not in parsed:
            return JSONResponse({"ok": False, "error": "Missing required section: multimodal"}, status_code=400)
        config_mgr._path.write_text(content, encoding="utf-8")
        # Force reload on next request
        config_mgr._mtime = 0.0
        logger.info("Config saved via Web UI")
        return JSONResponse({"ok": True})
    except yaml.YAMLError as exc:
        return JSONResponse({"ok": False, "error": f"YAML parse error: {exc}"}, status_code=400)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)


async def api_stats(req: Request) -> JSONResponse:
    """GET /api/stats — routing statistics + recent activity."""
    cfg = config_mgr.config
    return JSONResponse({
        "text": stats["text"],
        "multimodal": stats["multimodal"],
        "errors": stats["errors"],
        "uptime": int(time.monotonic() - start_time),
        "total": stats["text"] + stats["multimodal"] + stats["errors"],
        "text_backend": {"name": cfg.text.name, "model": cfg.text.model, "provider": cfg.text.provider, "url": cfg.text.messages_url},
        "multimodal_backend": {"name": cfg.multimodal.name, "model": cfg.multimodal.model, "provider": cfg.multimodal.provider, "url": cfg.multimodal.messages_url},
        "server": {"host": cfg.server.host, "port": cfg.server.port},
        "recent": list(reversed(activity_log)),
    })


async def api_presets(req: Request) -> JSONResponse:
    """GET /api/presets — available provider presets."""
    return JSONResponse(PROVIDER_PRESETS)


# ── Frontend static files ────────────────────────────────────────────
ALLOWED_EXTENSIONS = {".js", ".css", ".html"}
MIME_MAP = {".js": "application/javascript", ".css": "text/css", ".html": "text/html"}


async def serve_static(req: Request) -> Response:
    """Serve frontend static assets (.js, .css only)."""
    path = req.path_params.get("path", "")
    full = Path(__file__).parent / path
    if full.suffix.lower() not in ALLOWED_EXTENSIONS:
        return Response("Not Found", status_code=404)
    try:
        resolved = full.resolve()
        project_root = str(Path(__file__).parent.resolve())
        if not (str(resolved) + os.sep).startswith(project_root + os.sep):
            return Response("Forbidden", status_code=403)
        return FileResponse(str(resolved), media_type=MIME_MAP.get(full.suffix.lower()))
    except (OSError, ValueError):
        return Response("Not Found", status_code=404)


STATUS_PAGE_PATH = Path(__file__).with_name("index.html")


def load_status_page() -> str:
    """Load the Web UI shell from disk."""
    return STATUS_PAGE_PATH.read_text(encoding="utf-8")


# ── Management panel ──────────────────────────────────────────────

async def status_page(req: Request) -> HTMLResponse:
    return HTMLResponse(load_status_page())


# ── App factory ─────────────────────────────────────────────────────


def create_app() -> Starlette:
    return Starlette(debug=False, routes=[
        Route("/v1/messages", messages, methods=["POST"]),
        Route("/status", status_page, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route("/api/config", api_config_get, methods=["GET"]),
        Route("/api/config", api_config_post, methods=["POST"]),
        Route("/api/stats", api_stats, methods=["GET"]),
        Route("/api/presets", api_presets, methods=["GET"]),
        Route("/{path:path}", serve_static, methods=["GET"]),
    ])


# ── Entry point ─────────────────────────────────────────────────────


def _print_activate() -> None:
    """Print environment variables that users can copy-paste into their shell."""
    cfg = ConfigManager().config  # best-effort; defaults if config is invalid
    host, port = cfg.server.host, cfg.server.port
    lines = [
        f"export ANTHROPIC_BASE_URL='http://{host}:{port}'",
        "export ANTHROPIC_AUTH_TOKEN='cc-router'",
        "export ANTHROPIC_API_KEY=''",
    ]
    print("\n".join(lines))


def main() -> None:
    if "--activate" in sys.argv:
        _print_activate()
        return

    cfg = config_mgr.config
    log_level = cfg.logging.level.upper()

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if cfg.logging.log_file:
        Path(cfg.logging.log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(cfg.logging.log_file, encoding="utf-8"))

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
    )

    if not cfg.text.api_key or cfg.text.api_key.startswith("sk-YOUR"):
        logger.warning("Text backend API key not configured!")
    if not cfg.multimodal.api_key or cfg.multimodal.api_key.startswith("sk-YOUR"):
        logger.warning("Multimodal backend API key not configured!")

    logger.info("cc-router starting on %s:%d", cfg.server.host, cfg.server.port)
    logger.info("  Text backend : %s (%s)", cfg.text.model, cfg.text.name)
    logger.info("  Multimodal   : %s (%s)", cfg.multimodal.model, cfg.multimodal.name)
    logger.info("  Web UI       : http://%s:%d/status", cfg.server.host, cfg.server.port)

    app = create_app()

    client = httpx.AsyncClient(timeout=TIMEOUT)

    async def on_shutdown():
        await client.aclose()

    app.state.client = client
    app.add_event_handler("shutdown", on_shutdown)

    uvicorn.run(app, host=cfg.server.host, port=cfg.server.port, log_level=log_level.lower())


if __name__ == "__main__":
    main()
