# cc-router TRD — 技术需求文档

> 版本：1.0 | 日期：2026-05-27

## 1. 系统概述

cc-router 是一个本地运行的轻量级 HTTP 反向代理，部署在 Claude Code 客户端与 LLM 后端之间。它拦截 Anthropic Messages API 请求，根据内容类型（是否包含图片）自动路由到不同后端，并透传响应。

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────┐     HTTP POST        ┌──────────────┐     HTTP POST      ┌──────────────┐
│              │  /v1/messages         │              │  /v1/messages     │              │
│  Claude Code │ ──────────────────►   │  cc-router   │ ──────────────►   │  Text Backend│
│  (CLI)       │                       │  (Proxy)     │                   │  DeepSeek    │
│              │ ◄──────────────────   │              │ ◄──────────────   │              │
└──────────────┘     SSE/JSON          │              │     SSE/JSON      └──────────────┘
                                         │          │
                                         │          │     HTTP POST      ┌──────────────┐
                                         │          │  ──────────────►   │              │
                                         └──────────┤                    │  MM Backend  │
                                                    │  ◄──────────────   │  Qwen/Claude │
                                                    │     SSE/JSON      │              │
                                                    └──────────────┘
```

### 2.2 组件职责

| 组件 | 职责 |
|------|------|
| 路由检测器 | 解析请求体，判断是否包含图片内容 |
| 请求转发器 | 构建转发请求（替换 model、API Key），发送到目标后端 |
| 流式透传器 | 逐块转发 SSE 流，不缓冲不修改 |
| 配置管理器 | 加载和热重载 YAML 配置 |
| 统计模块 | 记录路由次数和错误数 |

### 2.3 技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| 语言 | Python 3.10+ | Claude Code 用户群体普遍已安装 |
| HTTP 框架 | Starlette | 轻量，原生支持 async 和 StreamingResponse |
| ASGI 服务器 | Uvicorn | Starlette 标配，生产级 |
| HTTP 客户端 | httpx | 支持 async + 流式读取，Starlette 生态常用 |
| 配置格式 | YAML | 可读性好，支持注释，适合手动编辑 |

本代理支持 9 种 provider 类型（deepseek / dashscope / zhipu / moonshot / minimax / stepfun / siliconflow / openrouter / anthropic + 各国际版变体），内置 23 个预设。

实际实现为三文件结构：
- `config.py` — 配置管理 + 23 个供应商预设 + 参数白名单
- `core.py` — 递归图片检测 + 参数过滤 + 请求转发 + SSE 流式
- `router.py` — Starlette 入口 + Web 管理面板

## 3. 数据流

### 3.1 请求处理流程

```
请求到达 /v1/messages
       │
       ▼
  解析 JSON body ──── 失败 ──→ 返回 400
       │
       ▼
  递归扫描整个请求体（含 system、tool_result 等）
  是否含 type: "image"?
       │
    ┌──┴──┐
    │     │
   Yes    No
    │     │
    ▼     ▼
  选择    选择
  多模态  纯文本
  配置    配置
    │     │
    └──┬──┘
       │
       ▼
  替换 body.model 为后端模型名
  构建转发 headers（替换 API Key）
       │
       ▼
  body.stream == true?
    │         │
   Yes       No
    │         │
    ▼         ▼
  流式转发   非流式转发
  (SSE)      (JSON)
    │         │
    └───┬─────┘
        │
        ▼
  透传响应回 Claude Code
```

### 3.2 配置热重载流程

```
请求到达
    │
    ▼
load_config()
    │
    ▼
比较 config.yaml 的 st_mtime
与缓存的 config_mtime
    │
  相同？─── Yes ──→ 返回缓存配置
    │
   No
    │
    ▼
重新读取 YAML → 更新缓存 → 更新 config_mtime
```

## 4. 接口定义

### 4.1 代理接口

#### POST /v1/messages

代理 Anthropic Messages API 请求。

**请求：** 与 Anthropic API 完全一致，代理不修改结构，仅替换 `model` 字段。

**路由规则：**

| 条件 | 目标后端 | model 替换示例 |
|------|---------|---------------|
| messages 中无 `type: "image"` | text 后端 | `claude-sonnet-4-20250514` → `deepseek-v4-pro[1m]` |
| messages 中含 `type: "image"` | multimodal 后端 | `claude-sonnet-4-20250514` → `qwen/qwen3.7-max` |

**响应：** 透传后端原始响应，不修改。

**错误处理：**

| 场景 | 返回 |
|------|------|
| 请求体非合法 JSON | 400 `{"error": "Invalid request body"}` |
| 后端不可达/超时 | 502 `{"error": "<异常信息>"}` |

### 4.2 管理接口

#### GET /status

返回 HTML 状态页面，展示：
- 当前路由配置（后端名称、模型、端点）
- 运行统计（运行时间、请求数、路由分布、错误数）

#### GET /health

```json
{
  "status": "ok",
  "uptime": 3600
}
```

## 5. 核心模块详细设计

### 5.1 图片检测 — `has_image_content(body: dict) -> bool`

**输入：** Anthropic Messages API 请求体

**逻辑：**

```python
for msg in body["messages"]:
    content = msg.get("content", "")
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "image":
                return True
return False
```

**关键点：**
- content 可能是字符串（纯文本快捷格式）或数组（多块格式），都要处理
- 只检测 `type: "image"`，不处理 `type: "tool_use"` 等其他块类型
- 遍历所有 messages（包括 system 之后的每一轮），因为图片可能出现在任意消息中

### 5.2 请求转发

**Headers 构建：**

```
content-type: application/json          # 固定
anthropic-version: <透传客户端值>        # 透传，默认 2023-06-01
x-api-key: <后端配置的 API Key>          # 替换为真实密钥
HTTP-Referer: https://github.com/cc-router  # OpenRouter 专用
X-Title: cc-router                         # OpenRouter 专用
```

**Body 处理：**
- `model` 字段替换为后端配置的模型名
- 其余字段原样保留（包括 max_tokens、temperature、tools、system 等）

### 5.3 流式转发

**协议：** Server-Sent Events (SSE)

**实现：**

```python
async with client.stream("POST", url, json=body, headers=headers) as resp:
    if resp.status_code != 200:
        # 读取错误信息并返回
        error_body = await resp.aread()
        yield error_body
        return
    async for chunk in resp.aiter_bytes():
        yield chunk
```

**关键点：**
- 使用 `aiter_bytes()` 逐块读取，不做文本解码，避免编码问题
- 上游返回非 200 时，读取完整错误体一次性返回（SSE 错误无法中途转 JSON，透传原始错误）
- `StreamingResponse` 的 media_type 设为 `text/event-stream`

### 5.4 超时配置

```python
TIMEOUT = httpx.Timeout(
    connect=10.0,   # 建立连接
    read=300.0,     # 读取响应（LLM 生成可能很慢）
    write=30.0,     # 发送请求体
    pool=10.0       # 连接池等待
)
```

read 超时设为 300 秒，因为 LLM 长文本生成可能需要较长时间，尤其在 DeepSeek 深度思考模式下。

## 6. 配置文件设计

### 6.1 config.yaml 结构

```yaml
server:
  host: "127.0.0.1"    # 监听地址，仅本地
  port: 8082            # 监听端口

text:
  name: "DeepSeek V4 Pro"              # 显示名称
  base_url: "https://api.deepseek.com/anthropic"  # 不含 /v1/messages
  api_key: "sk-xxx"                     # API 密钥
  model: "deepseek-v4-pro[1m]"          # 模型标识
  provider: "deepseek"                  # 供应商类型

multimodal:
  name: "Qwen-VL-Max via 百炼"
  base_url: "https://dashscope.aliyuncs.com/compatible-mode"
  api_key: "sk-xxx"
  model: "qwen-vl-max"
  provider: "dashscope"

logging:
  level: "INFO"        # DEBUG / INFO / WARNING / ERROR
  log_file: null       # 可选，日志文件路径
```

### 6.2 约定

- `base_url` 不含 `/v1/messages`，代理拼接完整路径
- `api_key` 以 `sk-` 开头，明文存储（仅本地配置文件）
- 配置修改后通过文件 mtime 检测自动重载，无需重启

## 7. 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 请求体 JSON 解析失败 | 返回 400，记录日志 |
| 后端连接失败 | 返回 502，stats.errors++ |
| 后端返回非 200 | 透传错误响应（非流式）/ 透传错误字节（流式） |
| 配置文件不存在/格式错误 | 启动时报错退出，不静默运行 |
| 后端响应超时 | httpx.Timeout 触发，返回 502 |

## 8. 安全考量

| 项目 | 措施 |
|------|------|
| 监听范围 | 默认仅 127.0.0.1，不暴露到局域网 |
| API Key 存储 | 明文存于本地配置文件，依赖 OS 文件权限保护 |
| 请求体日志 | 不记录请求体内容（可能含代码和图片数据），仅记录路由决策 |
| 认证 | 代理本身无认证（仅本地访问）；后续可扩展（P2） |

## 9. 部署与运行

### 9.1 环境要求

- Python 3.10+
- pip

### 9.2 安装

```bash
git clone <repo>
cd cc-router
pip install -r requirements.txt
```

### 9.3 运行

```bash
python router.py
```

### 9.4 Claude Code 配置

在 shell 配置中设置环境变量：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
export ANTHROPIC_AUTH_TOKEN="cc-router"
export ANTHROPIC_API_KEY=""
```

或在 `~/.claude/settings.json` 中配置。

### 9.5 后台运行（可选）

**Windows**：双击 `start.bat` 或使用 nssm 注册为系统服务。

**macOS / Linux**：

```bash
nohup python router.py > router.log 2>&1 &
```

或使用 systemd / launchd 管理为系统服务。

## 10. 已知限制

1. **格式兼容性**：仅支持 Anthropic Messages API 格式，后端必须兼容此格式
2. **图片检测维度单一**：已升级为递归全量扫描（system、messages、tool_result 等所有嵌套位置）
3. **无重试机制**：后端请求失败直接返回错误，不做自动重试
4. **统计非持久**：路由统计存在内存中，重启清零
5. **单实例**：不支持多实例部署或分布式场景
