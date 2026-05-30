---
name: cc-router-project-state
description: cc-router 项目当前状态 — 三主题 Web UI、MiMo 路由修复、5 bug code-review 修复
metadata:
  type: project
---

项目于 2026-05-30 完成 Web UI 主题改造、MiMo 路由修复、5 code-review bug 修复。

## 当前状态

- 后端：Python/Starlette，router.py 监听 127.0.0.1:8082
- 前端：ES6 组件化 SPA，三主题（dark/light/midnight），Material Symbols 图标
- API：新增 POST /api/config/provider（结构化 provider 配置，避免 YAML 拼接 bug）
- 测试：23/23 通过（PYTHONPATH=. pytest tests/ -v）
- 最新提交 b8db2d1 @ master

## 2026-05-30 修复

- **latin-1 header bug**：`backend.name`（中文）写入 HTTP 头导致 502。改 `backend.provider`
- **MiMo 模型名**：`mimo-v2.5[1M]` → `mimo-v2.5`，新增 `mimo-v2.5-pro`
- **CLAUDE_CODE_SIMPLE**：修复 MiMo 400（system role 兼容）
- **YAML 拼接 bug**：`saveProviderConfig()` 正则拼 YAML → 新 API 端点 `/api/config/provider` + yaml 库安全写入
- **start.bat 退化**：硬编码路径 → 还原 Python 检查 / pip install / cd 逻辑
- **5 code-review bug fixes**：null guard、body type check、YAML comment 保留、regex section 边界、dict 类型校验

## 已知技术债

- 10/12 组件 template() 未调用
- toast() 重复三处
- /api/presets 无意义轮询
- load_status_page() 无缓存
- stats["errors"] 多计 502 重试
- yaml.dump 仍在对 api_config_post 使用（会丢注释），仅 api_config_provider_post 改为 section 文本替换
