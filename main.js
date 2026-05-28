import { componentRegistry, $, $$, esc } from './components.js';

// Side-effect imports — registers all components
import { App } from './components/app.js';
import { Header } from './components/header.js';
import { Sidebar } from './components/sidebar.js';
import { MainContent } from './components/main-content.js';
import { StatsCard } from './components/stats-card.js';
import { RouteBoard } from './components/route-board.js';
import { BackendCard } from './components/backend-card.js';
import { LogTable } from './components/log-table.js';
import { ConfigEditor } from './components/config-editor.js';
import { ProviderGrid } from './components/provider-grid.js';
import { ApiChecker } from './components/api-checker.js';
import { Overview } from './components/overview.js';

// ── Global state ───────────────────────────────────────────────
const appState = {
    health: { status: 'error' },
    stats: {},
    config: {},
    presets: {}
};

let currentView = 'overview';
let mainContent = null;

// ── Utilities ──────────────────────────────────────────────────
function pct(part, total) {
    return total ? Math.round(part / total * 1000) / 10 : 0;
}

function fmtUptime(s) {
    s = Number(s || 0);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return `${h ? `${h}h ` : ''}${m}m ${sec}s`;
}

async function getJson(url) {
    const r = await fetch(url);
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { error: text, status: r.status }; }
}

function toast(msg, bad = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' err' : '');
    setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Global functions exposed for inline onclick ────────────────
window.showView = function (viewId) {
    currentView = viewId;
    if (mainContent) mainContent.showView(viewId);
    document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
    // Re-render current view
    if (viewId === 'overview') updateOverview();
    else if (viewId === 'logs') updateLogs();
    else if (viewId === 'providers') updateProviders();
    else if (viewId === 'config') updateConfig();
    else if (viewId === 'api') updateApi();
    else if (viewId === 'whitelist') updateWhitelist();
};

window.refresh = function () {
    return Promise.allSettled([
        getJson('/health'),
        getJson('/api/stats'),
        getJson('/api/config'),
        getJson('/api/presets')
    ]).then(([healthR, statsR, configR, presetsR]) => {
        appState.health = healthR.value || { status: 'error' };
        appState.stats = statsR.value || {};
        appState.config = configR.value || {};
        appState.presets = presetsR.value || {};

        // Update header signals
        updateHeader();

        // Update the active view
        if (currentView === 'overview') updateOverview();
        else if (currentView === 'logs') updateLogs();
        else if (currentView === 'providers') updateProviders();
        else if (currentView === 'config') updateConfig();
        else if (currentView === 'api') updateApi();
    });
};

window.filterLogs = function (type, btn, scope) {
    const root = scope ? document.querySelector(scope) : btn.closest('.panel');
    if (btn) root.querySelectorAll('.filters button').forEach(b => b.classList.toggle('active', b === btn));
    root.querySelectorAll('tbody tr').forEach(row => {
        const val = row.dataset.type || '';
        row.classList.toggle('hidden-row', !(type === 'all' || val.includes(type)));
    });
};

window.copyEnv = function () {
    navigator.clipboard?.writeText(
        'export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"\nexport ANTHROPIC_AUTH_TOKEN="cc-router"\nexport ANTHROPIC_API_KEY=""'
    ).then(() => toast('已复制环境变量')).catch(() => toast('浏览器未允许复制', true));
};

window.copyCurl = function () {
    navigator.clipboard?.writeText(
        'curl http://127.0.0.1:8082/health\ncurl http://127.0.0.1:8082/api/stats\ncurl http://127.0.0.1:8082/api/presets'
    ).then(() => toast('已复制 curl 命令')).catch(() => toast('浏览器未允许复制', true));
};

window.copyRecent = function () {
    navigator.clipboard?.writeText(
        JSON.stringify(appState.stats?.recent || [], null, 2)
    ).then(() => toast('已复制最近日志')).catch(() => toast('浏览器未允许复制', true));
};

window.saveConfig = async function () {
    const editor = document.getElementById('config-editor');
    if (!editor) return;
    const content = editor.value;
    try {
        const r = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await r.json();
        toast(data.ok ? '配置已保存，下次请求自动生效' : data.error, !data.ok);
        if (data.ok) { editor.value = ''; window.refresh(); }
    } catch (e) {
        toast('保存配置失败', true);
    }
};

window.loadConfig = async function () {
    const editor = document.getElementById('config-editor');
    if (editor) editor.value = '';
    await window.refresh();
    toast('已重新读取 config.yaml');
};

window.refreshPresets = function () {
    window.refresh();
    toast('供应商预设已刷新');
};

// ── Render helpers ─────────────────────────────────────────────
function updateHeader() {
    const s = appState.stats;
    const h = appState.health;
    const c = appState.config;

    const signal = document.getElementById('service-signal');
    if (signal) signal.textContent = h.status === 'ok' ? '代理运行中' : '代理异常';

    const reloadSignal = document.getElementById('reload-signal');
    if (reloadSignal) reloadSignal.textContent = c.mtime ? 'config.yaml 已热重载' : 'config.yaml 等待加载';

    const uptimeEl = document.getElementById('uptime');
    if (uptimeEl) uptimeEl.textContent = fmtUptime(s.uptime);

    const reloadTime = document.getElementById('reload-time');
    if (reloadTime && c.mtime) {
        reloadTime.textContent = new Date(c.mtime * 1000).toLocaleTimeString('zh-CN', { hour12: false });
    }

    const localHost = document.getElementById('local-host');
    if (localHost) localHost.textContent = s.server?.host || '127.0.0.1';
    const localPort = document.getElementById('local-port');
    if (localPort) localPort.textContent = s.server?.port || '8082';
}

function updateOverview() {
    const s = appState.stats;
    const h = appState.health;
    const total = s.total || (s.text || 0) + (s.multimodal || 0);
    const errors = s.errors || 0;
    const er = pct(errors, total);

    // Hero
    document.getElementById('hero-status').innerHTML = errors ? '路由有异常<span>。</span>' : '路由正常<span>。</span>';
    document.getElementById('hero-total').textContent = total;
    document.getElementById('hero-error-rate').textContent = er + '%';
    document.getElementById('hero-health').textContent = h.status === 'ok' ? 'OK' : 'ERR';

    // Stats strip
    document.getElementById('health-value').textContent = h.status === 'ok' ? 'OK' : 'ERR';
    document.getElementById('total-value').textContent = total;
    document.getElementById('text-value').textContent = s.text || 0;
    document.getElementById('image-value').textContent = s.multimodal || 0;
    document.getElementById('error-value').textContent = errors;
    document.getElementById('text-provider-label').textContent = s.text_backend?.provider || '--';
    document.getElementById('image-provider-label').textContent = s.multimodal_backend?.provider || '--';
    document.getElementById('text-share').textContent = pct(s.text, total) + '% 请求';
    document.getElementById('image-share').textContent = pct(s.multimodal, total) + '% 请求';
    document.getElementById('error-share').textContent = er + '% 错误率';

    // Backend cards
    renderBackendCard('text-backend', '纯文本后端', s.text_backend);
    renderBackendCard('image-backend', '多模态后端', s.multimodal_backend);

    // Bars
    setBar('bar-text', s.text, total);
    setBar('bar-image', s.multimodal, total);
    setBar('bar-error', errors, total);
    document.getElementById('bar-text-label').textContent = s.text || 0;
    document.getElementById('bar-image-label').textContent = s.multimodal || 0;
    document.getElementById('bar-error-label').textContent = errors;

    // Recent logs table
    const rows = s.recent || [];
    document.getElementById('recent-body').innerHTML = rows.slice(0, 6).map(logRowShort).join('') || '<tr><td colspan="5">暂无记录</td></tr>';

    // Config reload card
    renderConfigSummary();

    // API mini
    renderApiMini();
}

function renderBackendCard(id, title, backend) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<h3>${title}</h3>
        <div class="kv"><span>供应商</span><span>${esc(backend?.provider)}</span></div>
        <div class="kv"><span>模型</span><span>${esc(backend?.model)}</span></div>
        <div class="kv"><span>名称</span><span>${esc(backend?.name)}</span></div>
        <div class="kv"><span>端点</span><span>${esc(backend?.url)}</span></div>`;
}

function setBar(id, value, total) {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(value || 0);
    el.style.width = n ? Math.max(2, pct(n, total)) + '%' : '0';
}

function logRowShort(e) {
    const type = (e.status >= 300 ? 'error ' : '') + (e.route || 'text');
    const tag = e.route === 'multimodal' ? '<span class="tag violet">image</span>' : `<span class="tag blue">${esc(e.route || 'text')}</span>`;
    const ok = Number(e.status) < 300;
    return `<tr data-type="${esc(type)}"><td class="mono">${esc(e.time)}</td><td>${tag}</td><td class="mono">${esc(e.source_model)}</td><td>${esc(e.backend)}</td><td><span class="status ${ok ? 'good' : 'fail'}">${ok ? 'OK' : 'ERR'} ${esc(e.status)}</span></td></tr>`;
}

function renderConfigSummary() {
    const c = appState.config;
    const content = c.content || '';
    const mtime = c.mtime ? new Date(c.mtime * 1000) : null;
    const stamp = mtime ? mtime.toLocaleTimeString('zh-CN', { hour12: false }) : '--';

    const reloadBig = document.getElementById('reload-big');
    if (reloadBig) reloadBig.textContent = stamp;
    const reloadCopy = document.getElementById('reload-copy');
    if (reloadCopy) reloadCopy.textContent = mtime ? '上次加载成功，当前配置已生效' : '等待读取配置';

    const textKey = /text:[\s\S]*?api_key:\s*["']?([^"'\n]+)/.exec(content)?.[1]?.trim();
    const imageKey = /multimodal:[\s\S]*?api_key:\s*["']?([^"'\n]+)/.exec(content)?.[1]?.trim();

    const keyList = document.getElementById('key-list');
    if (keyList) keyList.innerHTML = [
        keyRow('text.api_key', textKey),
        keyRow('multimodal.api_key', imageKey),
        `<div class="row"><code>logging.log_file</code><span class="state warn">${/log_file:\s*null/.test(content) ? '未开启' : '已设置'}</span></div>`
    ].join('');
}

function keyRow(label, value) {
    const state = !value || /YOUR-|REPLACE|TODO/i.test(value);
    return `<div class="row"><code>${label}</code><span class="state ${state ? 'warn' : 'ok'}">${state ? '待配置' : '已配置'}</span></div>`;
}

function renderApiMini() {
    const el = document.getElementById('api-mini');
    if (!el) return;
    const cards = [
        ['GET /health', appState.health],
        ['GET /api/stats', appState.stats],
        ['GET /api/presets', appState.presets],
        ['GET /api/config', appState.config]
    ];
    el.innerHTML = cards.map(([name]) =>
        `<div class="row"><code>${name}</code><span class="state ok">OK</span></div>`
    ).join('');
}

function updateLogs() {
    const rows = appState.stats?.recent || [];
    const logsBody = document.getElementById('logs-body');
    if (!logsBody) return;
    logsBody.innerHTML = rows.map(e => {
        const type = (e.status >= 300 ? 'error ' : '') + (e.route || 'text');
        const tag = e.has_image ? '<span class="tag violet">image block</span>' : '<span class="tag blue">no image</span>';
        const ok = Number(e.status) < 300;
        return `<tr data-type="${esc(type)}"><td class="mono">${esc(e.time)}</td><td>${tag}</td><td class="mono">${esc(e.source_model)}</td><td class="mono">${esc(e.target_model)}</td><td>${esc(e.backend)}</td><td><span class="status ${ok ? 'good' : 'fail'}">${ok ? 'OK' : 'ERR'} ${esc(e.status)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="6">暂无记录</td></tr>';
}

function updateProviders() {
    const presets = appState.presets || {};
    const s = appState.stats || {};
    const active = new Set([s.text_backend?.provider, s.multimodal_backend?.provider]);
    const grid = document.getElementById('provider-grid');
    if (!grid) return;
    grid.innerHTML = Object.entries(presets).map(([key, p]) => {
        const isActive = active.has(key);
        return `<div class="provider ${isActive ? 'active' : ''}"><h3>${esc(p.name)}</h3><p>${key === s.text_backend?.provider ? '当前文本后端。' : key === s.multimodal_backend?.provider ? '当前多模态后端。' : '可选供应商预设。'}</p><div class="tags"><span class="tag ${isActive ? 'green' : ''}">${isActive ? 'active' : 'preset'}</span><span class="tag">${esc(p.auth)}</span></div><div class="base">${esc(p.base_url)}</div></div>`;
    }).join('');
}

function updateConfig() {
    const editor = document.getElementById('config-editor');
    if (!editor || !editor.value) {
        const content = appState.config?.content || '';
        if (editor) editor.value = content;
    }
    const stateEl = document.getElementById('config-state');
    if (stateEl) {
        stateEl.innerHTML = `<div class="row"><code>YAML parse</code><span class="state ok">已加载</span></div><div class="row"><code>text.provider</code><span class="state ok">${esc(appState.stats?.text_backend?.provider || '--')}</span></div><div class="row"><code>multimodal.provider</code><span class="state ok">${esc(appState.stats?.multimodal_backend?.provider || '--')}</span></div><div class="row"><code>api_key</code><span class="state ok">本地文件</span></div>`;
    }
}

function updateApi() {
    const cards = [
        ['GET /health', appState.health],
        ['GET /api/stats', appState.stats],
        ['GET /api/presets', { count: Object.keys(appState.presets || {}).length }],
        ['GET /api/config', { mtime: appState.config?.mtime }]
    ];
    const grid = document.getElementById('api-grid');
    if (grid) {
        grid.innerHTML = cards.map(([name, data]) =>
            `<div class="api-card"><div class="api-top"><strong><code>${name}</code></strong><span class="state ok">OK</span></div><pre>${esc(JSON.stringify(data, null, 2))}</pre></div>`
        ).join('');
    }
}

function updateWhitelist() {
    // Static content — no dynamic update needed
}

// ── Bootstrap ──────────────────────────────────────────────────
const app = new App();
app.render();

// Render Overview into the shell — this populates #overview with
// the hero / strip / grid DOM that updateOverview() expects.
const overviewInst = new Overview('#overview');
overviewInst.render();

// Grab mainContent instance after App renders
mainContent = componentRegistry.create('MainContent', '.main');

// Initial data load + periodic refresh
window.refresh();
setInterval(() => window.refresh(), 3000);
