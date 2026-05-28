from pathlib import Path

from starlette.testclient import TestClient

import router


def test_status_page_uses_external_template():
    template_path = Path(router.__file__).with_name("status_page.html")

    assert template_path.exists()
    assert template_path.read_text(encoding="utf-8").startswith("<!DOCTYPE html>")


def test_router_does_not_keep_legacy_inline_status_template():
    router_source = Path(router.__file__).read_text(encoding="utf-8")

    assert 'STATUS_PAGE = r"""<!DOCTYPE html>' not in router_source


def test_status_page_renders_polished_console():
    client = TestClient(router.create_app())

    response = client.get("/status")

    assert response.status_code == 200
    assert "cc-router 控制台" in response.text
    assert "路由正常" in response.text
    assert "当前路由策略" in response.text
    assert "API 检查" in response.text
    assert "参数白名单" in response.text
    assert "huashu-design 假设" not in response.text
