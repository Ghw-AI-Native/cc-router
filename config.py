"""Configuration management: YAML loading, hot-reload, and per-provider parameter whitelists."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import logging

import yaml

logger = logging.getLogger("cc-router")

# ── Parameter whitelists ────────────────────────────────────────────
# Only keys listed here survive filtering for the target backend.
# "model" is always replaced with the configured model name and never stripped.

PARAM_WHITELISTS: dict[str, set[str]] = {
    "deepseek": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "thinking",
    },
    "openrouter": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "top_k",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "metadata",
    },
    "dashscope": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "top_k",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "zhipu": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "thinking",
    },
    "moonshot": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "thinking",
    },
    "minimax": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "thinking",
    },
    "stepfun": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stream",
        "system",
    },
    "siliconflow": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "top_k",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "qianfan": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "volcengine": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "doubao": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "longcat": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "mimo": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "bailing": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "novita": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
    },
    "anthropic": {
        "model",
        "messages",
        "max_tokens",
        "temperature",
        "top_p",
        "top_k",
        "stop_sequences",
        "stream",
        "system",
        "tools",
        "tool_choice",
        "metadata",
        "thinking",
    },
}

# ── Provider presets ─────────────────────────────────────────────────
# Used by the Web UI to offer one-click provider selection.

PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "deepseek":    {"name": "DeepSeek",              "base_url": "https://api.deepseek.com/anthropic",                 "auth": "x-api-key"},
    "dashscope":   {"name": "阿里百炼 (DashScope)",    "base_url": "https://dashscope.aliyuncs.com/compatible-mode",    "auth": "Authorization: Bearer"},
    "bailian_coding": {"name": "百炼 Coding 专线",     "base_url": "https://coding.dashscope.aliyuncs.com/apps/anthropic","auth": "Authorization: Bearer"},
    "zhipu":       {"name": "智谱 GLM",               "base_url": "https://open.bigmodel.cn/api/anthropic",            "auth": "x-api-key"},
    "zhipu_en":    {"name": "智谱 GLM (国际)",        "base_url": "https://api.z.ai/api/anthropic",                   "auth": "x-api-key"},
    "qianfan":     {"name": "百度千帆",                "base_url": "https://qianfan.baidubce.com/anthropic/coding",     "auth": "x-api-key"},
    "moonshot":    {"name": "Kimi (Moonshot)",        "base_url": "https://api.moonshot.cn/anthropic",                 "auth": "x-api-key"},
    "kimi_coding": {"name": "Kimi Coding 专线",       "base_url": "https://api.kimi.com/coding/",                      "auth": "x-api-key"},
    "minimax":     {"name": "MiniMax",                "base_url": "https://api.minimaxi.com/anthropic",                "auth": "Authorization: Bearer"},
    "minimax_en":  {"name": "MiniMax (国际)",         "base_url": "https://api.minimax.io/anthropic",                  "auth": "Authorization: Bearer"},
    "stepfun":     {"name": "阶跃星辰 (StepFun)",      "base_url": "https://api.stepfun.com/step_plan",                 "auth": "Authorization: Bearer"},
    "stepfun_en":  {"name": "阶跃星辰 (国际)",          "base_url": "https://api.stepfun.ai/step_plan",                   "auth": "Authorization: Bearer"},
    "volcengine":  {"name": "火山引擎 Agentplan",      "base_url": "https://ark.cn-beijing.volces.com/api/coding",      "auth": "x-api-key"},
    "doubao":      {"name": "豆包 Seed",               "base_url": "https://ark.cn-beijing.volces.com/api/compatible",   "auth": "x-api-key"},
    "longcat":     {"name": "Longcat",                "base_url": "https://api.longcat.chat/anthropic",                "auth": "x-api-key"},
    "mimo":        {"name": "小米 MiMo",               "base_url": "https://api.xiaomimimo.com/anthropic",              "auth": "x-api-key"},
    "bailing":     {"name": "蚂蚁百灵 (BaiLing)",       "base_url": "https://api.tbox.cn/api/anthropic",                 "auth": "x-api-key"},
    "siliconflow": {"name": "硅基流动 (SiliconFlow)",   "base_url": "https://api.siliconflow.cn",                       "auth": "Authorization: Bearer"},
    "siliconflow_en": {"name": "硅基流动 (国际)",       "base_url": "https://api.siliconflow.com",                       "auth": "Authorization: Bearer"},
    "modelscope":  {"name": "ModelScope 魔搭",         "base_url": "https://api-inference.modelscope.cn",               "auth": "x-api-key"},
    "novita":      {"name": "Novita AI",              "base_url": "https://api.novita.ai/anthropic",                  "auth": "x-api-key"},
    "openrouter":  {"name": "OpenRouter",             "base_url": "https://openrouter.ai/api",                        "auth": "Authorization: Bearer"},
    "anthropic":   {"name": "Anthropic",              "base_url": "https://api.anthropic.com",                        "auth": "x-api-key"},
}


@dataclass
class BackendConfig:
    name: str
    base_url: str
    api_key: str
    model: str
    provider: str = "deepseek"  # See PROVIDER_PRESETS for full list

    @property
    def messages_url(self) -> str:
        base = self.base_url.rstrip("/")
        # OpenRouter: POST /api/v1/messages
        # DeepSeek Anthropic: POST /anthropic/v1/messages
        return f"{base}/v1/messages"


@dataclass
class ServerConfig:
    host: str = "127.0.0.1"
    port: int = 8082


@dataclass
class LoggingConfig:
    level: str = "INFO"
    log_file: str | None = None


@dataclass
class Config:
    server: ServerConfig
    text: BackendConfig
    multimodal: BackendConfig
    logging: LoggingConfig


class ConfigManager:
    """Loads config.yaml and watches for changes via mtime."""

    def __init__(self, path: str = "config.yaml") -> None:
        self._path = Path(path)
        self._mtime: float = 0.0
        self._config: Config | None = None

    def load(self) -> Config:
        if not self._path.exists():
            raise FileNotFoundError(f"Config file not found: {self._path}")

        with open(self._path, encoding="utf-8") as fh:
            raw = yaml.safe_load(fh)

        if not isinstance(raw, dict):
            raise ValueError(f"Config file must be a YAML mapping, got {type(raw).__name__}")

        if "text" not in raw:
            raise ValueError("Config file missing required section: text")
        if "multimodal" not in raw:
            raise ValueError("Config file missing required section: multimodal")

        self._config = Config(
            server=ServerConfig(**raw.get("server", {})),
            text=BackendConfig(**raw.get("text", {})),
            multimodal=BackendConfig(**raw.get("multimodal", {})),
            logging=LoggingConfig(**raw.get("logging", {})),
        )
        self._mtime = self._path.stat().st_mtime
        logger.info("Config loaded (text=%s, multimodal=%s)", self._config.text.name, self._config.multimodal.name)
        return self._config

    @property
    def config(self) -> Config:
        """Returns current config, reloading if file changed on disk."""
        try:
            mtime = self._path.stat().st_mtime
            if mtime > self._mtime:
                logger.info("Config file changed, reloading...")
                return self.load()
        except OSError:
            pass
        if self._config is None:
            return self.load()
        return self._config

    _VARIANT_MAP: dict[str, str] = {
        "zhipu_en": "zhipu", "stepfun_en": "stepfun",
        "minimax_en": "minimax", "siliconflow_en": "siliconflow",
        "kimi_coding": "moonshot", "bailian_coding": "dashscope",
    }

    @staticmethod
    def params_whitelist(provider: str) -> set[str]:
        base = ConfigManager._VARIANT_MAP.get(provider, provider)
        return PARAM_WHITELISTS.get(base, PARAM_WHITELISTS["anthropic"])
