import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * Sidebar 组件
 */
class Sidebar extends Component {
    constructor(selector) {
        super(selector);
    }

    template() {
        return `
            <div class="rail-label">Router</div>
            <button class="nav active" data-view="overview" onclick="showView('overview')">
                <span class="material-symbols-outlined">dashboard</span>总览
            </button>
            <button class="nav" data-view="logs" onclick="showView('logs')">
                <span class="material-symbols-outlined">receipt_long</span>路由日志
            </button>
            <button class="nav" data-view="providers" onclick="showView('providers')">
                <span class="material-symbols-outlined">hub</span>供应商
            </button>
            <button class="nav" data-view="config" onclick="showView('config')">
                <span class="material-symbols-outlined">settings</span>配置
            </button>
            <div class="rail-label" style="margin-top:22px">Checks</div>
            <button class="nav" data-view="api" onclick="showView('api')">
                <span class="material-symbols-outlined">check_circle</span>API 检查
            </button>
            <button class="nav" data-view="whitelist" onclick="showView('whitelist')">
                <span class="material-symbols-outlined">filter_list</span>参数白名单
            </button>
            <div class="local-card" style="margin-top:auto">
                <b>本地连接</b>
                <div><span>Host</span><code id="local-host">127.0.0.1</code></div>
                <div><span>Port</span><code id="local-port">8082</code></div>
                <div><span>Uptime</span><code id="uptime">--</code></div>
                <div><span>Reload</span><code id="reload-time">--</code></div>
            </div>
        `;
    }

    bindEvents() {
        // View switching events are handled globally
    }

    afterRender() {
        // Update local connection info
    }
}

export { Sidebar };
componentRegistry.register('Sidebar', Sidebar);