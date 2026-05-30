---
name: cc-router-project-state
description: cc-router 项目当前状态 — 三主题 Web UI、MiMo 路由修复、latin-1 header bug 已修
metadata:
  type: project
---

项目于 2026-05-30 完成 Web UI 主题改造和 MiMo 路由修复。

## 当前状态

- 后端：Python/Starlette，router.py 监听 127.0.0.1:8082
- 前端：ES6 组件化 SPA，三主题（dark/light/midnight），Material Symbols 图标
- 测试：23/23 通过（PYTHONPATH=. pytest tests/ -v）
- 最新提交 d6fe1c5 @ master

## 2026-05-30 修复

- **latin-1 header bug**：`backend.name`（中文）写入 HTTP 头导致 502。改 `backend.provider`
- **MiMo 模型名**：`mimo-v2.5[1M]` → `mimo-v2.5`
- **CLAUDE_CODE_SIMPLE**：修复 MiMo 400（system role 兼容）

## 已知技术债

- 10/12 组件 template() 未调用
- toast() 重复三处
- /api/presets 无意义轮询
- load_status_page() 无缓存
- saveProviderConfig() 正则拼 YAML
- stats["errors"] 多计 502 重试
- start.bat 硬编码路径
