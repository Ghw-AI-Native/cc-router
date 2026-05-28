"""Unit tests for cc-router core functions."""
from config import BackendConfig, ConfigManager, PARAM_WHITELISTS
from core import detect_images, filter_params, build_headers


class TestDetectImages:
    def test_no_image(self):
        body = {"messages": [{"role": "user", "content": "hello world"}]}
        assert detect_images(body) is False

    def test_string_content(self):
        body = {"messages": [{"role": "user", "content": "just text"}]}
        assert detect_images(body) is False

    def test_image_in_message(self):
        body = {
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "xxx"}},
                    {"type": "text", "text": "What is this?"},
                ],
            }]
        }
        assert detect_images(body) is True

    def test_image_in_system_array(self):
        body = {
            "system": [{"type": "text", "text": "assistant"}, {"type": "image", "source": {}}],
            "messages": [{"role": "user", "content": "hi"}],
        }
        assert detect_images(body) is True

    def test_image_nested_in_tool_result(self):
        body = {
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "abc",
                    "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "xxx"}}],
                }],
            }]
        }
        assert detect_images(body) is True

    def test_image_deeply_nested(self):
        body = {
            "a": {"b": {"c": {"messages": [{"content": [{"nested": {"type": "image"}}]}]}}},
        }
        assert detect_images(body) is True

    def test_empty(self):
        assert detect_images({}) is False
        assert detect_images({"messages": []}) is False

    def test_type_image_string_value(self):
        """type: image at dict level, not inside content blocks."""
        body = {"messages": [{"type": "image", "content": "x"}]}
        assert detect_images(body) is True


class TestFilterParams:
    def test_removes_model_from_whitelist(self):
        result = filter_params({"model": "claude-4", "max_tokens": 100, "thinking": {"type": "enabled"}}, PARAM_WHITELISTS["anthropic"])
        assert "model" not in result

    def test_keeps_whitelisted(self):
        result = filter_params({"max_tokens": 100, "messages": [], "temperature": 0.7}, PARAM_WHITELISTS["deepseek"])
        assert result == {"max_tokens": 100, "messages": [], "temperature": 0.7}

    def test_strips_non_whitelisted(self):
        result = filter_params({"messages": [], "max_tokens": 50, "unknown_field": "x"}, {"messages", "max_tokens", "model"})
        assert "unknown_field" not in result
        assert result == {"messages": [], "max_tokens": 50}

    def test_thinking_kept_for_deepseek_removed_for_openrouter(self):
        body = {"model": "x", "max_tokens": 10, "messages": [], "thinking": {"type": "enabled"}}
        ds = filter_params(body, ConfigManager.params_whitelist("deepseek"))
        opr = filter_params(body, ConfigManager.params_whitelist("openrouter"))
        assert "thinking" in ds
        assert "thinking" not in opr


class TestBuildHeaders:
    def test_deepseek(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="deepseek")
        h = build_headers(be)
        assert h["x-api-key"] == "sk-abc"
        assert "Authorization" not in h

    def test_dashscope(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="dashscope")
        h = build_headers(be)
        assert h["Authorization"] == "Bearer sk-abc"
        assert "x-api-key" not in h

    def test_openrouter(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-or-abc", model="m", provider="openrouter")
        h = build_headers(be)
        assert h["Authorization"] == "Bearer sk-or-abc"
        assert h["HTTP-Referer"] == "https://github.com/cc-router"
        assert h["X-Title"] == "cc-router"

    def test_anthropic(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="anthropic")
        h = build_headers(be)
        assert h["x-api-key"] == "sk-abc"
        assert "Authorization" not in h

    def test_minimax(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="minimax")
        h = build_headers(be)
        assert h["Authorization"] == "Bearer sk-abc"

    def test_zhipu(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="zhipu")
        h = build_headers(be)
        assert h["x-api-key"] == "sk-abc"

    def test_default_client_version(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="deepseek")
        h = build_headers(be)
        assert h["anthropic-version"] == "2023-06-01"

    def test_custom_client_version(self):
        be = BackendConfig(name="d", base_url="http://x", api_key="sk-abc", model="m", provider="deepseek")
        h = build_headers(be, "2024-01-01")
        assert h["anthropic-version"] == "2024-01-01"
