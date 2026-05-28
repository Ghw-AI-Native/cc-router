import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * ApiChecker 组件
 */
class ApiChecker extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
    }

    template() {
        return `
            <div class="api-grid" id="api-grid">
                ${this.apiCards().map(card => this.apiCard(card)).join('')}
            </div>
        `;
    }

    apiCards() {
        return [
            ['GET /health', this.options?.health || {}],
            ['GET /api/stats', this.options?.stats || {}],
            ['GET /api/presets', { count: Object.keys(this.options?.presets || {}).length }],
            ['GET /api/config', { mtime: this.options?.config?.mtime }]
        ];
    }

    apiCard([name, data]) {
        return `
            <div class="api-card">
                <div class="api-top">
                    <strong><code>${name}</code></strong>
                    <span class="state ok">OK</span>
                </div>
                <pre>${esc(JSON.stringify(data, null, 2))}</pre>
            </div>
        `;
    }

    bindEvents() {
        const refreshButton = this.findChild('button[onclick="refresh()"]');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.refresh());
        }

        const copyButton = this.findChild('button[onclick="copyCurl()"]');
        if (copyButton) {
            copyButton.addEventListener('click', () => this.copyCurl());
        }
    }

    afterRender() {
        // Initialize API mini display
        this.updateMiniDisplay();
    }

    updateMiniDisplay() {
        const miniContainer = this.findChild('#api-mini');
        if (miniContainer) {
            miniContainer.innerHTML = this.apiCards().map(([name]) => `
                <div class="row">
                    <code>${name}</code>
                    <span class="state ok">OK</span>
                </div>
            `).join('');
        }
    }

    async refresh() {
        if (window.refresh) {
            await window.refresh();
        }
    }

    copyCurl() {
        const curlCommands = [
            'curl http://127.0.0.1:8082/health',
            'curl http://127.0.0.1:8082/api/stats',
            'curl http://127.0.0.1:8082/api/presets'
        ];
        navigator.clipboard?.writeText(curlCommands.join('\n'))
            .then(() => this.showToast('已复制 curl 命令'))
            .catch(() => this.showToast('浏览器未允许复制', true));
    }

    showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show${isError ? ' err' : ''}`;
        setTimeout(() => toast.classList.remove('show'), 2400);
    }
}

export { ApiChecker };
componentRegistry.register('ApiChecker', ApiChecker);