---
name: cc-router-project-state
description: cc-router 项目当前状态 — config save API、settings 模板导出、console 打磨、30 测试全通过
metadata:
  type: project
---

项目于 2026-06-01 完成 config save API、Claude Code settings 模板导出、Web UI console 打磨。2026-05-30 完成 Web UI 主题改造、MiMo 路由修复、5 code-review bug 修复。

## 当前状态

- 后端：Python/Starlette，router.py 监听 127.0.0.1:8082
- 前端：ES6 组件化 SPA，三主题（dark/light/midnight），Material Symbols 图标
- API：POST /api/config（完整 YAML 写入+引号归一化）、POST /api/config/provider（结构化 provider 配置）
- UI：Overview 快捷操作（复制 settings.json、测试 API、打开配置）、polished console 空状态
- 测试：30/30 通过（PYTHONPATH=. pytest tests/ -v）
- 最新提交 d207184 @ master

## 2026-06-01 变更

- **config save API**：新增 `POST /api/config`，含 `normalize_config_quotes()` YAML 引号归一化，BackendConfig/ServerConfig/LoggingConfig 验证
- **settings 模板导出**：前端 `copyClaudeSettings()` + `CLAUDE_SETTINGS_TEMPLATE`，`.claude/settings.cc-router.example.json` 完整模板
- **console polish**：empty-state 组件、backend-item 状态 chip、hero-kicker、quick-action-list
- **config.example.yaml**：安全的可提交配置模板，`config.yaml` 从 git 移除（已 gitignore）
- **安全修复**：502 错误信息泛化（不泄漏后端连接细节）
- **代码质量**：`uniqueModels()` O(n²)→O(n) Set、删除重复 `import re`、`renderConfigSummary` 复用 `parseConfigSection()`、合并重复 CSS 块
- **文档同步**：CLAUDE.md/AGENTS.md 测试数量 23→30、TRD.md §5.3 流式代码示例与实际实现同步
- **artifact 清理**：删除 theme/v/screenshot PNG、ui-image/、畸形 JSON 测试文件

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
- `normalize_config_quotes` 和 `validate_config_mapping` 在 router.py（应迁至 config.py）
- `CLAUDE_SETTINGS_TEMPLATE` 三处硬编码（main.js + settings.cc-router.example.json + README），应统一从后端提供
- 前端 YAML 解析（`cleanYamlScalar`/`parseConfigSection`）应改为结构化 API
