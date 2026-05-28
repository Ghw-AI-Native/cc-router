# cc-router

本地代理，自动检测 Claude Code 请求中的图片内容，路由到不同后端：
- **纯文本** → 高性价比模型（DeepSeek V4 Pro 等）
- **含图片** → 多模态模型（Qwen-VL、Claude 等）

内置 23 个供应商预设，对标 cc-switch。浏览器打开 `http://127.0.0.1:8082/status` 即可管理。

## 快速开始

```bash
pip install -r requirements.txt
python router.py
# 浏览器打开 http://127.0.0.1:8082/status 配置
```

**Windows**：双击 `start.bat`

## Claude Code 配置

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
export ANTHROPIC_AUTH_TOKEN="cc-router"
export ANTHROPIC_API_KEY=""
```

或在 `~/.claude/settings.json` 中设置 `env` 字段。

## 内置供应商（23 个）

### 国产官方
DeepSeek · 阿里百炼 · 百炼 Coding 专线 · 智谱 GLM · 智谱 GLM 国际 · 百度千帆 · Kimi · Kimi Coding 专线 · MiniMax · MiniMax 国际 · 阶跃星辰 · 阶跃星辰国际 · 火山引擎 Agentplan · 豆包 Seed · Longcat · 小米 MiMo · 蚂蚁百灵

### 聚合网关
OpenRouter · 硅基流动 · 硅基流动国际 · ModelScope 魔搭 · Novita AI

### 官方
Anthropic

## 管理端点

| 端点 | 说明 |
|------|------|
| `GET /status` | Web 管理面板（总览 / 路由日志 / 供应商 / 配置编辑 / API 检查 / 参数白名单） |
| `GET /health` | JSON 健康检查 |
| `GET /api/stats` | 路由统计 JSON |
| `GET /api/config` | 读写 config.yaml |
| `GET /api/presets` | 供应商预设列表 |
