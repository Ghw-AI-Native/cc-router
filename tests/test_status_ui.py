from pathlib import Path
import json
import shutil
import subprocess

import pytest
from starlette.testclient import TestClient

import router


def with_config_path(config_path):
    class ConfigPathContext:
        def __enter__(self):
            self.old_path = router.config_mgr._path
            self.old_mtime = router.config_mgr._mtime
            self.old_config = router.config_mgr._config
            router.config_mgr._path = config_path
            router.config_mgr._mtime = 0.0
            router.config_mgr._config = None

        def __exit__(self, exc_type, exc, tb):
            router.config_mgr._path = self.old_path
            router.config_mgr._mtime = self.old_mtime
            router.config_mgr._config = self.old_config

    return ConfigPathContext()


def test_config_save_normalizes_string_quotes():
    raw = """logging:
  level: INFO
  log_file: null
multimodal:
  api_key: sk-test
  base_url: https://api.example.com/anthropic
  model: mimo-v2.5
  name: 小米 MiMo
  provider: mimo
server:
  host: 127.0.0.1
  port: 8082
text:
  name: "DeepSeek"
  model: "deepseek-v4-pro[1m]"
"""

    normalized = router.normalize_config_quotes(raw)

    assert '  level: "INFO"' in normalized
    assert "  log_file: null" in normalized
    assert '  api_key: "sk-test"' in normalized
    assert '  base_url: "https://api.example.com/anthropic"' in normalized
    assert '  model: "mimo-v2.5"' in normalized
    assert '  name: "小米 MiMo"' in normalized
    assert '  provider: "mimo"' in normalized
    assert '  host: "127.0.0.1"' in normalized
    assert "  port: 8082" in normalized
    assert '  model: "deepseek-v4-pro[1m]"' in normalized


def test_config_save_rejects_incomplete_backend(tmp_path):
    config_path = tmp_path / "config.yaml"
    original = """text:
  name: "DeepSeek"
  base_url: "https://api.deepseek.com/anthropic"
  api_key: "sk-test"
  model: "deepseek-v4-pro[1m]"
  provider: "deepseek"
multimodal:
  name: "小米 MiMo"
  base_url: "https://api.xiaomimimo.com/anthropic"
  api_key: "sk-test"
  model: "mimo-v2.5"
  provider: "mimo"
"""
    invalid = """text:
  name: "DeepSeek"
  base_url: "https://api.deepseek.com/anthropic"
  api_key: "sk-test"
  provider: "deepseek"
multimodal:
  name: "小米 MiMo"
  base_url: "https://api.xiaomimimo.com/anthropic"
  api_key: "sk-test"
  model: "mimo-v2.5"
  provider: "mimo"
"""
    config_path.write_text(original, encoding="utf-8")

    with with_config_path(config_path):
        client = TestClient(router.create_app())
        response = client.post("/api/config", json={"content": invalid})

    assert response.status_code == 400
    assert "text.model" in response.json()["error"]
    assert config_path.read_text(encoding="utf-8") == original


def test_status_page_uses_external_template():
    template_path = Path(router.__file__).with_name("index.html")

    assert template_path.exists()
    assert template_path.read_text(encoding="utf-8").startswith("<!DOCTYPE html>")


def test_router_does_not_keep_legacy_inline_status_template():
    router_source = Path(router.__file__).read_text(encoding="utf-8")

    assert 'STATUS_PAGE = r"""<!DOCTYPE html>' not in router_source


def test_main_js_is_syntax_valid():
    if not shutil.which("node"):
        pytest.skip("node is required to parse the frontend module")

    main_js = Path(router.__file__).with_name("main.js")
    script = (
        "const fs = require('node:fs');"
        "const vm = require('node:vm');"
        f"new vm.SourceTextModule(fs.readFileSync({str(main_js)!r}, 'utf8'));"
    )
    result = subprocess.run(
        ["node", "--experimental-vm-modules", "-e", script],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def test_status_page_renders_polished_console():
    client = TestClient(router.create_app())

    response = client.get("/status")

    assert response.status_code == 200
    # SPA: content is rendered by JS; raw HTML has mount point + module entry
    assert '<div id="app">' in response.text
    assert '<script type="module" src="main.js">' in response.text
    assert "cc-router 控制台" in response.text  # in <title>
    assert "huashu-design 假设" not in response.text


def test_overview_exposes_router_console_empty_state_and_actions():
    project_root = Path(router.__file__).parent
    overview_source = (project_root / "components" / "overview.js").read_text(encoding="utf-8")
    main_source = (project_root / "main.js").read_text(encoding="utf-8")

    assert "等待第一条请求" in overview_source
    assert "复制 settings.json" in overview_source
    assert "copyClaudeSettings()" in overview_source
    assert "window.copyClaudeSettings" in main_source
    assert "window.copyEnv" in main_source
    assert "测试 API" in overview_source
    assert "打开配置" in overview_source
    assert "empty-state" in main_source


def test_claude_settings_example_is_full_local_router_template():
    settings_path = Path(router.__file__).parent / ".claude" / "settings.cc-router.example.json"
    settings = json.loads(settings_path.read_text(encoding="utf-8"))

    env = settings["env"]
    assert env["ANTHROPIC_BASE_URL"] == "http://127.0.0.1:8082"
    assert env["ANTHROPIC_AUTH_TOKEN"] == "cc-router"
    assert env["ANTHROPIC_API_KEY"] == ""
    assert env["ANTHROPIC_MODEL"] == "deepseek-v4-pro[1m]"
    assert env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] == "deepseek-v4-flash"
    assert env["ANTHROPIC_DEFAULT_OPUS_MODEL"] == "deepseek-v4-pro[1m]"
    assert env["ANTHROPIC_DEFAULT_SONNET_MODEL"] == "deepseek-v4-pro[1m]"
    assert env["ANTHROPIC_DISABLE_TELEMETRY"] == "1"
    assert env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] == "1"
    assert env["CLAUDE_CODE_EFFORT_LEVEL"] == "max"
    assert env["CLAUDE_CODE_SUBAGENT_MODEL"] == "deepseek-v4-flash"

    assert settings["mcpServers"]["chrome-devtools"] == {
        "command": "chrome-devtools-mcp",
        "args": ["--isolated"],
    }
    assert settings["mcpServers"]["context7"] == {"command": "context7-mcp"}
    assert settings["mcpServers"]["playwright"] == {"command": "playwright-mcp"}
    assert settings["permissions"] == {"defaultMode": "bypassPermissions"}
    assert settings["skipDangerousModePermissionPrompt"] is True
    assert settings["statusLine"] == {
        "command": "node C:/Users/Administrator/.claude/statusline-wrapper.mjs",
        "type": "command",
    }
    assert settings["theme"] == "dark"


def test_status_frontend_assets_disable_browser_cache():
    client = TestClient(router.create_app())

    status_response = client.get("/status")
    script_response = client.get("/main.js")

    assert status_response.headers["cache-control"] == "no-store"
    assert script_response.headers["cache-control"] == "no-store"


def test_mobile_topbar_can_grow_without_covering_content():
    index_source = Path(router.__file__).with_name("index.html").read_text(encoding="utf-8")

    assert ".product{grid-template-rows:auto 1fr}" in index_source
