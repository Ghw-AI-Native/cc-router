"""cc-router — lightweight proxy with intelligent image routing + Web management panel."""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx
import uvicorn
import yaml
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, HTMLResponse, Response, StreamingResponse
from starlette.routing import Route

from config import ConfigManager, PROVIDER_PRESETS
from core import detect_images, forward, connect_stream, iter_stream_bytes, TIMEOUT

# ── Globals ─────────────────────────────────────────────────────────
config_mgr = ConfigManager()
start_time = time.monotonic()
stats: dict[str, int] = {"text": 0, "multimodal": 0, "errors": 0}
activity_log: list[dict[str, Any]] = []  # Last 50 routing decisions
MAX_LOG = 50

logger = logging.getLogger("cc-router")


def _record(route: str, has_image: bool, source_model: str, target_model: str, backend_name: str, status: int) -> None:
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%H:%M:%S")
    activity_log.append({
        "time": now, "route": route, "has_image": has_image,
        "source_model": source_model, "target_model": target_model,
        "backend": backend_name, "status": status,
    })
    if len(activity_log) > MAX_LOG:
        activity_log.pop(0)


# ── Route handlers ──────────────────────────────────────────────────


async def messages(req: Request) -> StreamingResponse | JSONResponse:
    """POST /v1/messages — main proxy endpoint."""
    client: httpx.AsyncClient = req.app.state.client
    cfg = config_mgr.config

    try:
        body: dict[str, Any] = await req.json()
    except (json.JSONDecodeError, ValueError):
        stats["errors"] += 1
        return JSONResponse({"error": "Invalid request body"}, status_code=400)

    has_image = detect_images(body)
    backend = cfg.multimodal if has_image else cfg.text
    route_label = "multimodal" if has_image else "text"
    stats[route_label] += 1

    source_model = str(body.get("model", "?"))
    client_version = req.headers.get("anthropic-version", "2023-06-01")

    logger.info("→ %s | has_image=%s | %s → %s (%s)", route_label, has_image, source_model, backend.model, backend.name)

    is_stream = body.get("stream", False)

    try:
        if is_stream:
            resp, _proxy_body = await connect_stream(client, backend, body, client_version)
            proxy_headers = {"x-cc-router-backend": backend.name, "x-cc-router-route": route_label}
            if resp.status_code != 200:
                error_body = await resp.aread()
                _record(route_label, has_image, source_model, backend.model, backend.name, resp.status_code)
                return Response(content=error_body, status_code=resp.status_code, media_type="application/json", headers=proxy_headers)
            _record(route_label, has_image, source_model, backend.model, backend.name, 200)
            return StreamingResponse(iter_stream_bytes(resp), media_type="text/event-stream", headers=proxy_headers)

        status_code, resp_headers, resp_body = await forward(client, backend, body, client_version)

        proxy_headers = {
            k: v for k, v in resp_headers.items()
            if k.lower() not in {"transfer-encoding", "content-encoding", "content-length"}
        }
        proxy_headers["x-cc-router-backend"] = backend.name
        proxy_headers["x-cc-router-route"] = route_label

        _record(route_label, has_image, source_model, backend.model, backend.name, status_code)
        return Response(content=resp_body, status_code=status_code, headers=proxy_headers, media_type="application/json")
    except Exception as exc:
        stats["errors"] += 1
        _record(route_label, has_image, source_model, backend.model, backend.name, 502)
        logger.error("Proxy error: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=502)


async def health(req: Request) -> JSONResponse:
    """GET /health — machine-readable health check."""
    return JSONResponse({"status": "ok", "uptime": int(time.monotonic() - start_time)})


# ── API endpoints ───────────────────────────────────────────────────


async def api_config_get(req: Request) -> JSONResponse:
    """GET /api/config — return config.yaml content."""
    path = config_mgr._path
    try:
        content = path.read_text(encoding="utf-8")
        return JSONResponse({"content": content, "mtime": path.stat().st_mtime})
    except OSError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_config_post(req: Request) -> JSONResponse:
    """POST /api/config — save config.yaml (validates YAML first)."""
    try:
        payload = await req.json()
        content = payload.get("content", "")
        if not content.strip():
            return JSONResponse({"ok": False, "error": "Content is empty"}, status_code=400)
        # Validate YAML
        yaml.safe_load(content)
        config_mgr._path.write_text(content, encoding="utf-8")
        # Force reload on next request
        config_mgr._mtime = 0.0
        logger.info("Config saved via Web UI")
        return JSONResponse({"ok": True})
    except yaml.YAMLError as exc:
        return JSONResponse({"ok": False, "error": f"YAML parse error: {exc}"}, status_code=400)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)


async def api_stats(req: Request) -> JSONResponse:
    """GET /api/stats — routing statistics + recent activity."""
    cfg = config_mgr.config
    return JSONResponse({
        "text": stats["text"],
        "multimodal": stats["multimodal"],
        "errors": stats["errors"],
        "uptime": int(time.monotonic() - start_time),
        "total": stats["text"] + stats["multimodal"] + stats["errors"],
        "text_backend": {"name": cfg.text.name, "model": cfg.text.model, "provider": cfg.text.provider, "url": cfg.text.messages_url},
        "multimodal_backend": {"name": cfg.multimodal.name, "model": cfg.multimodal.model, "provider": cfg.multimodal.provider, "url": cfg.multimodal.messages_url},
        "server": {"host": cfg.server.host, "port": cfg.server.port},
        "recent": list(reversed(activity_log)),
    })


async def api_presets(req: Request) -> JSONResponse:
    """GET /api/presets — available provider presets."""
    return JSONResponse(PROVIDER_PRESETS)


# ── Management panel ──────────────────────────────────────────────

STATUS_PAGE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cc-router</title>
<style>
:root{
  --bg:#0b0d14; --surface:#11141d; --surface2:#181b26; --border:#1e2130;
  --text:#cdd1d9; --text2:#838999; --text3:#565b6b;
  --accent:#5b7fff; --accent2:#8b5cf6; --green:#34d399; --red:#f87171;
  --radius:10px; --radius-sm:6px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased}

/* ── Layout ── */
.shell{display:flex;min-height:100vh}
.sidebar{width:220px;background:var(--surface);border-right:1px solid var(--border);padding:1.25rem;display:flex;flex-direction:column;gap:1.5rem;flex-shrink:0}
.sidebar .logo{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.05rem;letter-spacing:-.3px}
.sidebar .logo .dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;align-items:center;gap:.6rem;padding:.55rem .75rem;border-radius:var(--radius-sm);color:var(--text2);text-decoration:none;font-size:.85rem;transition:all .15s;cursor:pointer}
.nav a:hover{color:var(--text);background:var(--surface2)}
.nav a.active{color:var(--accent);background:var(--surface2)}
.nav a svg{width:16px;height:16px;opacity:.7;flex-shrink:0}
.sidebar .footer{margin-top:auto;font-size:.75rem;color:var(--text3);display:flex;align-items:center;gap:.4rem}
.sidebar .footer .live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.content{flex:1;padding:2rem;overflow-y:auto}
.panel{display:none;max-width:780px}
.panel.active{display:block}

/* ── Dashboard ── */
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1.5rem}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.5rem;display:flex;justify-content:space-between;align-items:center}
.stat-card .info .label{font-size:.75rem;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:.3rem}
.stat-card .info .num{font-size:2rem;font-weight:700;letter-spacing:-1px;line-height:1}
.stat-card .icon{width:40px;height:40px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:1.2rem}
.stat-text .num{color:var(--accent)} .stat-text .icon{background:#5b7fff18;color:var(--accent)}
.stat-mm .num{color:var(--accent2)} .stat-mm .icon{background:#8b5cf618;color:var(--accent2)}
.stat-err .num{color:var(--red)} .stat-err .icon{background:#f8717118;color:var(--red)}

.chart-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.5rem}
.chart-section h3{font-size:.8rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:1rem;font-weight:500}
.bar-stack{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:.75rem}
.bar-stack .b1{background:var(--accent);transition:width .4s ease}
.bar-stack .b2{background:var(--accent2);transition:width .4s ease}
.bar-stack .b3{background:var(--red);transition:width .4s ease}
.bar-legend{display:flex;gap:2rem;font-size:.78rem;color:var(--text2)}
.bar-legend span{display:flex;align-items:center;gap:.4rem}
.bar-legend span::before{content:'';width:8px;height:8px;border-radius:2px;flex-shrink:0}

.backends{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.backend-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.5rem}
.backend-card h3{font-size:.75rem;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.75rem;font-weight:500}
.backend-card .kv{display:flex;justify-content:space-between;padding:.35rem 0;font-size:.82rem}
.backend-card .kv .k{color:var(--text2)}
.backend-card .kv .v{color:var(--text);font-family:"SF Mono","Cascadia Code",monospace;font-size:.78rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Config editor ── */
.editor-frame{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.editor-toolbar{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border);background:var(--surface2);flex-wrap:wrap}
.editor-toolbar label{font-size:.78rem;color:var(--text2)}
.editor-toolbar select,.editor-toolbar button{appearance:none;padding:.4rem .75rem;border-radius:var(--radius-sm);font-size:.8rem;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-family:inherit;outline:none}
.editor-toolbar select:focus,.editor-toolbar button:focus{border-color:var(--accent)}
.editor-toolbar button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:500}
.editor-toolbar button.primary:hover{opacity:.9}
.editor-body{display:flex}
.editor-body .gutter{padding:.75rem 0;background:var(--surface2);border-right:1px solid var(--border);user-select:none;min-width:46px;text-align:right;font-family:"SF Mono","Cascadia Code",monospace;font-size:12px;line-height:1.6;color:var(--text3)}
.editor-body .gutter span{display:block;padding:0 .75rem}
.editor-body textarea{flex:1;background:transparent;color:var(--text);border:none;padding:.75rem 1rem;font-size:13px;line-height:1.6;font-family:"SF Mono","Cascadia Code","JetBrains Mono",monospace;resize:vertical;min-height:400px;outline:none;tab-size:2}
.editor-body textarea::selection{background:#5b7fff30}

/* ── Activity ── */
.log-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.log-wrap table{width:100%;font-size:.8rem;border-collapse:collapse}
.log-wrap th{text-align:left;padding:.6rem 1rem;color:var(--text3);font-weight:500;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);background:var(--surface2)}
.log-wrap td{padding:.5rem 1rem;border-bottom:1px solid var(--surface2);font-size:.82rem}
.log-wrap tr:hover td{background:var(--surface2)}
.tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:.68rem;font-weight:600;vertical-align:middle}
.tag-img{background:#8b5cf620;color:var(--accent2)}
.tag-ok{color:var(--green)}
.tag-err{color:var(--red)}
.empty-state{text-align:center;padding:4rem 2rem;color:var(--text3)}
.empty-state .icon{font-size:2rem;margin-bottom:.75rem}
.time-faint{font-size:.72rem;color:var(--text3)}

/* ── Toast ── */
.toast{position:fixed;top:1.25rem;right:1.25rem;padding:.75rem 1.25rem;border-radius:var(--radius-sm);font-size:.82rem;color:#fff;opacity:0;transform:translateY(-8px);transition:all .25s;z-index:100;pointer-events:none;font-weight:500}
.toast.show{opacity:1;transform:translateY(0)}
.toast-ok{background:#059669}
.toast-err{background:#dc2626}

/* ── Responsive ── */
@media(max-width:700px){
  .shell{flex-direction:column}
  .sidebar{width:100%;flex-direction:row;flex-wrap:wrap;padding:1rem;gap:.75rem}
  .sidebar .footer{display:none}
  .nav{flex-direction:row;flex-wrap:wrap}
  .content{padding:1rem}
  .stats-row,.backends{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div class="shell">
  <aside class="sidebar">
    <div class="logo"><span class="dot"></span>cc-router</div>
    <nav class="nav">
      <a class="active" data-panel="dashboard" onclick="switchPanel('dashboard',this)">
        <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
        总览
      </a>
      <a data-panel="config" onclick="switchPanel('config',this)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2.5M8 12.5V15M3.05 3.05l1.77 1.77M11.18 11.18l1.77 1.77M1 8h2.5M12.5 8H15M3.05 12.95l1.77-1.77M11.18 4.82l1.77-1.77"/></svg>
        配置
      </a>
      <a data-panel="activity" onclick="switchPanel('activity',this)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h8M2 12h5"/></svg>
        日志
      </a>
    </nav>
    <div class="footer"><span class="live-dot"></span><span id="uptime-text">--</span></div>
  </aside>

  <main class="content">
    <!-- Dashboard -->
    <div class="panel active" id="panel-dashboard">
      <div class="stats-row">
        <div class="stat-card stat-text"><div class="info"><div class="label">纯文本</div><div class="num" id="s-text">0</div></div><div class="icon">T</div></div>
        <div class="stat-card stat-mm"><div class="info"><div class="label">多模态</div><div class="num" id="s-mm">0</div></div><div class="icon">M</div></div>
        <div class="stat-card stat-err"><div class="info"><div class="label">错误</div><div class="num" id="s-err">0</div></div><div class="icon">!</div></div>
      </div>
      <div class="chart-section">
        <h3>路由分布</h3>
        <div class="bar-stack"><span class="b1" id="bar1" style="width:0%"></span><span class="b2" id="bar2" style="width:0%"></span><span class="b3" id="bar3" style="width:0%"></span></div>
        <div class="bar-legend">
          <span style="color:var(--accent)">纯文本 <strong id="l-text">0</strong></span>
          <span style="color:var(--accent2)">多模态 <strong id="l-mm">0</strong></span>
          <span style="color:var(--red)">错误 <strong id="l-err">0</strong></span>
        </div>
      </div>
      <div class="backends">
        <div class="backend-card" id="be-text"><h3>纯文本后端</h3></div>
        <div class="backend-card" id="be-mm"><h3>多模态后端</h3></div>
      </div>
    </div>

    <!-- Config -->
    <div class="panel" id="panel-config">
      <div class="editor-frame">
        <div class="editor-toolbar">
          <label>预设</label>
          <select id="ps-select"><option value="">选择供应商…</option></select>
          <label>目标</label>
          <select id="ps-target"><option value="text">纯文本</option><option value="multimodal">多模态</option></select>
          <button onclick="applyPreset()">应用</button>
          <button class="primary" onclick="saveConfig()" style="margin-left:auto">保存</button>
        </div>
        <div class="editor-body">
          <div class="gutter" id="gutter"></div>
          <textarea id="editor" spellcheck="false" placeholder="loading config..."></textarea>
        </div>
      </div>
    </div>

    <!-- Activity -->
    <div class="panel" id="panel-activity">
      <div class="log-wrap" id="log-body"><div class="empty-state"><div class="icon">--</div><p>暂无记录</p></div></div>
    </div>
  </main>
</div>

<div class="toast" id="toast"></div>

<script>
const $=s=>document.querySelector(s);
function kv(k,v){return'<div class="kv"><span class="k">'+k+'</span><span class="v">'+esc(v)+'</span></div>'}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// Panel nav
function switchPanel(name,el){
  $$a('.nav a').forEach(a=>a.classList.remove('active'));
  el.classList.add('active');
  $$a('.panel').forEach(p=>p.classList.remove('active'));
  $('#panel-'+name).classList.add('active');
}

// Toast
let tt;
function toast(msg,ok){const e=$('#toast');e.textContent=msg;e.className='toast '+(ok?'toast-ok':'toast-err')+' show';clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('show'),2500)}

// Load presets
fetch('/api/presets').then(r=>r.json()).then(d=>{const s=$('#ps-select');for(const[k,v]of Object.entries(d)){const o=document.createElement('option');o.value=k;o.textContent=v.name;s.appendChild(o)}});

function applyPreset(){
  const k=$('#ps-select').value;if(!k)return toast('先选一个预设',false);
  fetch('/api/presets').then(r=>r.json()).then(d=>{
    const p=d[k],t=$('#ps-target').value,lines=$('#editor').value.split('\n');
    let inS=false,ind='';const out=[];
    for(const l of lines){
      if(l.trimStart().startsWith(t+':')){inS=true;ind=l.match(/^(\s*)/)[1];out.push(l);continue}
      if(inS&&l&&!l.startsWith(ind+'  ')&&!l.startsWith(ind+' ')&&!l.startsWith('\t'))inS=false;
      if(inS){
        const tr=l.trimStart();
        if(tr.startsWith('name:'))out.push(ind+'  name: "'+p.name+'"');
        else if(tr.startsWith('base_url:'))out.push(ind+'  base_url: "'+p.base_url+'"');
        else if(tr.startsWith('provider:'))out.push(ind+'  provider: "'+k+'"');
        else out.push(l);  // keep model, api_key, and any other lines
      }else out.push(l);
    }
    $('#editor').value=out.join('\n');syncGutter();
    toast(p.name+' → '+t,true);
  });
}

function syncGutter(){const n=$('#editor').value.split('\n').length;let h='';for(let i=1;i<=n;i++)h+='<span></span>';$('#gutter').innerHTML=h}
$('#editor').addEventListener('input',syncGutter);
$('#editor').addEventListener('scroll',()=>{$('#gutter').scrollTop=$('#editor').scrollTop});

function saveConfig(){
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:$('#editor').value})})
    .then(r=>r.json()).then(d=>toast(d.ok?'已保存，下次请求生效':d.error,d.ok)).catch(e=>toast(e.message,false));
}

// Refresh
function refresh(){
  Promise.all([fetch('/api/stats').then(r=>r.json()),fetch('/api/config').then(r=>r.json())]).then(([s,c])=>{
    $('#s-text').textContent=s.text;$('#s-mm').textContent=s.multimodal;$('#s-err').textContent=s.errors;
    const t=s.total||1;$('#bar1').style.width=(s.text/t*100)+'%';$('#bar2').style.width=(s.multimodal/t*100)+'%';$('#bar3').style.width=(s.errors/t*100)+'%';
    $('#l-text').textContent=s.text;$('#l-mm').textContent=s.multimodal;$('#l-err').textContent=s.errors;
    const h=Math.floor(s.uptime/3600),m=Math.floor(s.uptime%3600/60),se=s.uptime%60;
    $('#uptime-text').textContent=(h?h+'h ':'')+m+'m '+se+'s';
    // Backend cards
    $('#be-text').innerHTML='<h3>纯文本后端</h3>'+kv('名称',s.text_backend.name)+kv('模型',s.text_backend.model)+kv('供应商',s.text_backend.provider)+kv('端点',s.text_backend.url);
    $('#be-mm').innerHTML='<h3>多模态后端</h3>'+kv('名称',s.multimodal_backend.name)+kv('模型',s.multimodal_backend.model)+kv('供应商',s.multimodal_backend.provider)+kv('端点',s.multimodal_backend.url);
    // Config (once)
    if(c.content&&!$('#editor').value){$('#editor').value=c.content;syncGutter()}
    // Log
    const r=s.recent||[];if(r.length){let h2='<table><tr><th>时间</th><th>方向</th><th>来源模型</th><th>→ 目标模型</th><th>后端</th><th>状态</th></tr>';
      for(const e of r){const ok=e.status<300;h2+='<tr><td class="time-faint">'+e.time+'</td><td>'+(e.has_image?'<span class="tag tag-img">IMG</span> ':'')+e.route+'</td><td>'+e.source_model+'</td><td>'+e.target_model+'</td><td>'+e.backend+'</td><td class="'+(ok?'tag-ok':'tag-err')+'">'+(ok?'OK':'ERR')+' '+e.status+'</td></tr>'}
      h2+='</table>';$('#log-body').innerHTML=h2}
  });
}
function $$a(s){return document.querySelectorAll(s)}
refresh();setInterval(refresh,3000);
</script>
</body>
</html>"""


async def status_page(req: Request) -> HTMLResponse:
    return HTMLResponse(STATUS_PAGE)


# ── App factory ─────────────────────────────────────────────────────


def create_app() -> Starlette:
    return Starlette(debug=False, routes=[
        Route("/v1/messages", messages, methods=["POST"]),
        Route("/status", status_page, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route("/api/config", api_config_get, methods=["GET"]),
        Route("/api/config", api_config_post, methods=["POST"]),
        Route("/api/stats", api_stats, methods=["GET"]),
        Route("/api/presets", api_presets, methods=["GET"]),
    ])


# ── Entry point ─────────────────────────────────────────────────────


def _print_activate() -> None:
    """Print environment variables that users can copy-paste into their shell."""
    cfg = ConfigManager().config  # best-effort; defaults if config is invalid
    host, port = cfg.server.host, cfg.server.port
    lines = [
        f"export ANTHROPIC_BASE_URL='http://{host}:{port}'",
        "export ANTHROPIC_AUTH_TOKEN='cc-router'",
        "export ANTHROPIC_API_KEY=''",
    ]
    print("\n".join(lines))


def main() -> None:
    if "--activate" in sys.argv:
        _print_activate()
        return

    cfg = config_mgr.config
    log_level = cfg.logging.level.upper()

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if cfg.logging.log_file:
        Path(cfg.logging.log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(cfg.logging.log_file, encoding="utf-8"))

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
    )

    if not cfg.text.api_key or cfg.text.api_key.startswith("sk-YOUR"):
        logger.warning("Text backend API key not configured!")
    if not cfg.multimodal.api_key or cfg.multimodal.api_key.startswith("sk-YOUR"):
        logger.warning("Multimodal backend API key not configured!")

    logger.info("cc-router starting on %s:%d", cfg.server.host, cfg.server.port)
    logger.info("  Text backend : %s (%s)", cfg.text.model, cfg.text.name)
    logger.info("  Multimodal   : %s (%s)", cfg.multimodal.model, cfg.multimodal.name)
    logger.info("  Web UI       : http://%s:%d/status", cfg.server.host, cfg.server.port)

    app = create_app()

    client = httpx.AsyncClient(timeout=TIMEOUT)

    async def on_shutdown():
        await client.aclose()

    app.state.client = client
    app.add_event_handler("shutdown", on_shutdown)

    uvicorn.run(app, host=cfg.server.host, port=cfg.server.port, log_level=log_level.lower())


if __name__ == "__main__":
    main()
