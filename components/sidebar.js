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
            <div class="rail-label">ROUTER</div>
            <button class="nav active" data-view="overview" onclick="showView('overview')">
                <span class="sq"></span>总览
            </button>
            <button class="nav" data-view="logs" onclick="showView('logs')">
                <span class="sq"></span>路由日志
            </button>
            <button class="nav" data-view="providers" onclick="showView('providers')">
                <span class="sq"></span>供应商
            </button>
            <button class="nav" data-view="config" onclick="showView('config')">
                <span class="sq"></span>配置
            </button>
            <div class="rail-label" style="margin-top:22px">CHECKS</div>
            <button class="nav" data-view="api" onclick="showView('api')">
                <span class="sq"></span>API 检查
            </button>
            <button class="nav" data-view="whitelist" onclick="showView('whitelist')">
                <span class="sq"></span>参数白名单
            </button>
            <div class="local-card">
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