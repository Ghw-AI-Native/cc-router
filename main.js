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

// ── Theme switching ───────────────────────────────────────────
const THEMES = ['dark', 'light', 'midnight'];
const THEME_ICONS = { dark: '◐', light: '☀', midnight: '★' };
const THEME_LABELS = { dark: 'Dark', light: 'Light', midnight: 'Midnight' };
let currentTheme = localStorage.getItem('cc-router-theme') || 'dark';

function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cc-router-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = THEME_ICONS[theme] || '●';
}

window.cycleTheme = function () {
    const idx = THEMES.indexOf(currentTheme);
    applyTheme(THEMES[(idx + 1) % THEMES.length]);
};

// Apply saved theme on load
applyTheme(currentTheme);

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

function copyText(text, successMessage) {
    const fallbackCopy = () => new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            if (!document.execCommand('copy')) throw new Error('copy command failed');
            resolve();
        } catch (err) {
            reject(err);
        } finally {
            textarea.remove();
        }
    });

    const modernCopy = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(text)
        : Promise.reject(new Error('clipboard unavailable'));

    modernCopy
        .catch(() => fallbackCopy())
        .then(() => toast(successMessage))
        .catch(() => toast('浏览器未允许复制', true));
}

const CLAUDE_SETTINGS_TEMPLATE = {
    env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8082',
        ANTHROPIC_AUTH_TOKEN: 'cc-router',
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
        CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
        ANTHROPIC_DISABLE_TELEMETRY: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    },
    mcpServers: {
        'chrome-devtools': {
            command: 'chrome-devtools-mcp',
            args: ['--isolated']
        },
        context7: {
            command: 'context7-mcp'
        },
        playwright: {
            command: 'playwright-mcp'
        }
    },
    permissions: {
        defaultMode: 'bypassPermissions'
    },
    skipDangerousModePermissionPrompt: true,
    statusLine: {
        command: 'node C:/Users/Administrator/.claude/statusline-wrapper.mjs',
        type: 'command'
    },
    theme: 'dark'
};

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
    copyText(
        'export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"\nexport ANTHROPIC_AUTH_TOKEN="cc-router"\nexport ANTHROPIC_API_KEY=""',
        '已复制环境变量'
    );
};

window.copyClaudeSettings = function () {
    const s = appState.stats || {};
    const host = s.server?.host || '127.0.0.1';
    const port = s.server?.port || 8082;
    const baseUrl = `http://${host}:${port}`;
    const settings = { ...CLAUDE_SETTINGS_TEMPLATE, env: { ...CLAUDE_SETTINGS_TEMPLATE.env, ANTHROPIC_BASE_URL: baseUrl } };
    copyText(
        JSON.stringify(settings, null, 2),
        '已复制 settings.json 模板'
    );
};

window.copyCurl = function () {
    copyText(
        'curl http://127.0.0.1:8082/health\ncurl http://127.0.0.1:8082/api/stats\ncurl http://127.0.0.1:8082/api/presets',
        '已复制 curl 命令'
    );
};

window.copyRecent = function () {
    copyText(
        JSON.stringify(appState.stats?.recent || [], null, 2),
        '已复制最近日志'
    );
};

// ── Provider modal ────────────────────────────────────────────────
function cleanYamlScalar(value) {
    let scalar = String(value || '').trim();
    const commentIndex = scalar.search(/\s#/);
    if (commentIndex >= 0) scalar = scalar.slice(0, commentIndex).trim();
    if ((scalar.startsWith('"') && scalar.endsWith('"')) || (scalar.startsWith("'") && scalar.endsWith("'"))) {
        scalar = scalar.slice(1, -1);
    }
    return scalar.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseConfigSection(content, role) {
    const sectionRegex = new RegExp(`^${role}:\\s*\\n((?:[ \\t]+.*(?:\\n|$))*)`, 'm');
    const sectionMatch = sectionRegex.exec(content || '');
    const values = {};
    if (!sectionMatch) return values;

    sectionMatch[1].split(/\r?\n/).forEach(line => {
        const pair = /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/.exec(line);
        if (pair) values[pair[1]] = cleanYamlScalar(pair[2]);
    });
    return values;
}

function uniqueModels(models, selectedModel) {
    const set = new Set();
    if (selectedModel) set.add(selectedModel);
    (models || []).forEach(m => { if (m) set.add(m); });
    return [...set];
}

window.openProviderModal = function (providerKey) {
    const presets = appState.presets || {};
    const p = presets[providerKey];
    if (!p) return;
    const s = appState.stats || {};
    const currentRole = providerKey === s.text_backend?.provider ? 'text'
        : providerKey === s.multimodal_backend?.provider ? 'multimodal' : '';

    const content = appState.config?.content || '';
    const sections = {
        text: parseConfigSection(content, 'text'),
        multimodal: parseConfigSection(content, 'multimodal')
    };
    const models = p.models || [];
    const defaultValues = {
        apiKey: '',
        model: models[0] || '',
        baseUrl: p.base_url
    };
    const valuesForRole = (role) => {
        const section = sections[role] || {};
        if (section.provider !== providerKey) return defaultValues;
        return {
            apiKey: section.api_key || '',
            model: section.model || defaultValues.model,
            baseUrl: section.base_url || p.base_url
        };
    };
    const initialValues = currentRole ? valuesForRole(currentRole) : defaultValues;
    const initialModels = uniqueModels(models, initialValues.model);

    const modal = document.getElementById('provider-modal');
    if (!modal) return;
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeProviderModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>${esc(p.name)}</h2>
                <button class="modal-close" onclick="closeProviderModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="modal-field">
                    <label>分配给</label>
                    <div class="modal-radio-group">
                        <label class="modal-radio ${currentRole === 'text' ? 'selected' : ''}">
                            <input type="radio" name="provider-role" value="text" ${currentRole === 'text' ? 'checked' : ''}>
                            <span>纯文本后端 (text)</span>
                        </label>
                        <label class="modal-radio ${currentRole === 'multimodal' ? 'selected' : ''}">
                            <input type="radio" name="provider-role" value="multimodal" ${currentRole === 'multimodal' ? 'checked' : ''}>
                            <span>多模态后端 (multimodal)</span>
                        </label>
                    </div>
                </div>
                <div class="modal-field">
                    <label>API Key</label>
                    <input type="password" class="modal-input" id="modal-api-key" placeholder="sk-..." value="${esc(initialValues.apiKey)}">
                </div>
                <div class="modal-field">
                    <label>模型</label>
                    <input type="text" class="modal-input" id="modal-model" list="modal-model-options" placeholder="模型名称" value="${esc(initialValues.model)}">
                    <datalist id="modal-model-options">
                        ${initialModels.map(m => `<option value="${esc(m)}"></option>`).join('')}
                    </datalist>
                </div>
                <div class="modal-field">
                    <label>端点</label>
                    <input type="text" class="modal-input" id="modal-base-url" value="${esc(initialValues.baseUrl)}">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="closeProviderModal()">取消</button>
                <button class="btn primary" id="modal-save-btn">保存并应用</button>
            </div>
        </div>
    `;
    modal.classList.add('show');

    // Radio change highlight
    modal.querySelectorAll('input[name="provider-role"]').forEach(r => {
        r.addEventListener('change', () => {
            modal.querySelectorAll('.modal-radio').forEach(l => l.classList.remove('selected'));
            r.closest('.modal-radio').classList.add('selected');
            const roleValues = valuesForRole(r.value);
            const apiKeyInput = document.getElementById('modal-api-key');
            const modelInput = document.getElementById('modal-model');
            const baseUrlInput = document.getElementById('modal-base-url');
            const modelOptions = document.getElementById('modal-model-options');
            if (apiKeyInput) apiKeyInput.value = roleValues.apiKey;
            if (modelInput) modelInput.value = roleValues.model;
            if (baseUrlInput) baseUrlInput.value = roleValues.baseUrl;
            if (modelOptions) {
                modelOptions.innerHTML = uniqueModels(models, roleValues.model)
                    .map(m => `<option value="${esc(m)}"></option>`)
                    .join('');
            }
        });
    });

    // Save button
    const saveBtn = document.getElementById('modal-save-btn');
    if (saveBtn) saveBtn.onclick = () => saveProviderConfig(providerKey);
};

window.closeProviderModal = function () {
    const modal = document.getElementById('provider-modal');
    if (modal) modal.classList.remove('show');
};

window.saveProviderConfig = async function (providerKey) {
    const presets = appState.presets || {};
    const p = presets[providerKey];
    if (!p) return;

    const role = document.querySelector('input[name="provider-role"]:checked')?.value;
    const apiKey = document.getElementById('modal-api-key')?.value?.trim();
    const model = document.getElementById('modal-model')?.value?.trim() || '';
    const baseUrl = document.getElementById('modal-base-url')?.value?.trim() || p.base_url;

    if (!role) { toast('请选择分配给文本还是多模态', true); return; }
    if (!apiKey) { toast('请填写 API Key', true); return; }
    if (!model) { toast('请选择或输入模型', true); return; }

    try {
        const r = await fetch('/api/config/provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, provider: providerKey, api_key: apiKey, model, base_url: baseUrl })
        });
        const data = await r.json();
        if (data.ok) {
            toast(`${p.name} 已配置为${role === 'text' ? '文本' : '多模态'}后端`);
            closeProviderModal();
            window.refresh();
        } else {
            toast(data.error || '保存失败', true);
        }
    } catch (e) {
        toast('保存失败: ' + e.message, true);
    }
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

    // Header
    const heroStatus = document.getElementById('hero-status');
    if (heroStatus) heroStatus.textContent = errors ? '路由有异常' : '路由正常';
    const heroHealthText = document.getElementById('hero-health-text');
    if (heroHealthText) heroHealthText.textContent = h.status === 'ok' ? '代理运行中，配置已生效' : '代理异常';

    // Stats cards
    const healthValue = document.getElementById('health-value');
    if (healthValue) healthValue.textContent = h.status === 'ok' ? 'OK' : 'ERR';
    const totalValue = document.getElementById('total-value');
    if (totalValue) totalValue.textContent = total;
    const totalNote = document.getElementById('total-note');
    if (totalNote) totalNote.textContent = `文本 ${s.text || 0} / 多模态 ${s.multimodal || 0}`;
    const textValue = document.getElementById('text-value');
    if (textValue) textValue.textContent = s.text || 0;
    const textShare = document.getElementById('text-share');
    if (textShare) textShare.textContent = s.text_backend?.provider ? `${s.text_backend.provider} · ${pct(s.text, total)}%` : '0% 请求';
    const errorValue = document.getElementById('error-value');
    if (errorValue) errorValue.textContent = errors;
    const errorShare = document.getElementById('error-share');
    if (errorShare) errorShare.textContent = er > 0 ? `${er}% 错误率 · 需关注` : '无错误';

    // Backend cards
    renderBackendCard('text-backend', '纯文本后端', s.text_backend);
    renderBackendCard('image-backend', '多模态后端', s.multimodal_backend);

    // Recent logs table
    const rows = s.recent || [];
    const recentBody = document.getElementById('recent-body');
    if (recentBody) recentBody.innerHTML = rows.slice(0, 8).map(logRowShort).join('') || emptyRecentState(5);

    // Config reload card
    renderConfigSummary();

    // API mini
    renderApiMini();
}

function renderBackendCard(id, title, backend) {
    const el = document.getElementById(id);
    if (!el) return;
    const configured = backend?.provider && backend?.model;
    el.innerHTML = `<div class="backend-title"><h3>${title}</h3><span class="status-chip ${configured ? 'ok' : 'warn'}">${configured ? 'READY' : 'CHECK'}</span></div>
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

function emptyRecentState(colspan) {
    return `<tr><td colspan="${colspan}">
        <div class="empty-state">
            <span class="material-symbols-outlined">route</span>
            <strong>等待第一条请求</strong>
            <small>启动 Claude Code 后，这里会显示每次请求的来源模型、路由后端和状态码。</small>
        </div>
    </td></tr>`;
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

    const textSec = parseConfigSection(content, 'text');
    const imageSec = parseConfigSection(content, 'multimodal');
    const textKey = textSec.api_key || '';
    const imageKey = imageSec.api_key || '';

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
        const role = key === s.text_backend?.provider ? 'text' : key === s.multimodal_backend?.provider ? 'multimodal' : '';
        return `<div class="provider ${isActive ? 'active' : ''}" data-provider="${key}" style="cursor:pointer"><h3>${esc(p.name)}</h3><p>${role === 'text' ? '当前文本后端' : role === 'multimodal' ? '当前多模态后端' : '点击配置此供应商'}</p><div class="tags"><span class="tag ${isActive ? 'green' : ''}">${isActive ? 'active · ' + role : '点击配置'}</span><span class="tag">${esc(p.auth)}</span></div><div class="base">${esc(p.base_url)}</div></div>`;
    }).join('');

    // Event delegation for provider clicks
    grid.onclick = function (e) {
        const card = e.target.closest('.provider[data-provider]');
        if (card) openProviderModal(card.dataset.provider);
    };
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
