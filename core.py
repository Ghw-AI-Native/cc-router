"""Core proxy logic: image detection, parameter filtering, request forwarding."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from config import BackendConfig, ConfigManager

logger = logging.getLogger("cc-router")

# ── Timeouts ────────────────────────────────────────────────────────
TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)

# ── Image detection ─────────────────────────────────────────────────


def detect_images(body: dict[str, Any]) -> bool:
    """Recursively scan entire request body for `type: "image"` blocks.

    Covers messages[*].content, system (when it's a content array),
    tool_result content blocks, and any other nested location.
    """
    if isinstance(body, dict):
        if body.get("type") == "image":
            return True
        return any(detect_images(v) for v in body.values())
    if isinstance(body, list):
        return any(detect_images(item) for item in body)
    return False


# ── Parameter filtering ─────────────────────────────────────────────


def filter_params(body: dict[str, Any], whitelist: set[str]) -> dict[str, Any]:
    """Return a copy of *body* with only whitelisted top-level keys.

    ``model`` is always stripped — the caller replaces it with the
    target backend's model name.
    """
    # Keep everything in whitelist EXCEPT "model" (caller replaces it)
    allowed = whitelist - {"model"}
    return {k: v for k, v in body.items() if k in allowed}


# ── Header construction ─────────────────────────────────────────────


def build_headers(backend: BackendConfig, client_version: str = "2023-06-01") -> dict[str, str]:
    """Build proxy request headers for the target backend."""
    headers = {
        "Content-Type": "application/json",
        "anthropic-version": client_version,
    }

    BEARER_PROVIDERS = {
        "dashscope", "bailian_coding", "openrouter",
        "minimax", "minimax_en", "stepfun", "stepfun_en",
        "siliconflow", "siliconflow_en",
    }
    if backend.provider in BEARER_PROVIDERS:
        headers["Authorization"] = f"Bearer {backend.api_key}"
        if backend.provider == "openrouter":
            headers["HTTP-Referer"] = "https://github.com/cc-router"
            headers["X-Title"] = "cc-router"
    else:
        headers["x-api-key"] = backend.api_key

    return headers


# ── Forwarding ──────────────────────────────────────────────────────


def _build_proxy_body(backend: BackendConfig, body: dict[str, Any]) -> dict[str, Any]:
    """Return the body that should be forwarded to *backend*."""
    whitelist = ConfigManager.params_whitelist(backend.provider)
    proxy_body = filter_params(body, whitelist)
    proxy_body["model"] = backend.model
    return proxy_body


async def forward(
    client: httpx.AsyncClient,
    backend: BackendConfig,
    body: dict[str, Any],
    client_version: str,
) -> tuple[int, dict[str, str], bytes]:
    """Forward a non-streaming request and return (status, headers, body)."""
    url = backend.messages_url
    headers = build_headers(backend, client_version)
    proxy_body = _build_proxy_body(backend, body)

    logger.debug("Forwarding to %s (%s)", backend.name, url)

    resp = await client.post(url, json=proxy_body, headers=headers)
    resp_body = await resp.aread()
    return resp.status_code, dict(resp.headers), resp_body


async def connect_stream(
    client: httpx.AsyncClient,
    backend: BackendConfig,
    body: dict[str, Any],
    client_version: str,
) -> tuple[httpx.Response, dict[str, Any]]:
    """Open a streaming connection and return (response, proxy_body).

    The caller checks ``resp.status_code`` and either reads the error
    or passes ``resp`` to ``iter_stream_bytes``.
    """
    url = backend.messages_url
    headers = build_headers(backend, client_version)
    proxy_body = _build_proxy_body(backend, body)

    logger.debug("Streaming to %s (%s)", backend.name, url)

    request = client.build_request("POST", url, json=proxy_body, headers=headers)
    resp = await client.send(request, stream=True)
    return resp, proxy_body


async def iter_stream_bytes(resp: httpx.Response):
    """Yield byte chunks from an open streaming *resp* (200 only)."""
    try:
        async for chunk in resp.aiter_bytes():
            yield chunk
    finally:
        await resp.aclose()
