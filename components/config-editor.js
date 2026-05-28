import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * ConfigEditor 组件
 */
class ConfigEditor extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
        this.config = options.config || '';
    }

    template() {
        return `
            <div class="config-layout">
                <div class="panel">
                    <div class="panel-head">
                        <h2>config.yaml</h2>
                        <span>本地文件</span>
                    </div>
                    <div class="panel-body">
                        <textarea class="editor" id="config-editor" spellcheck="false">${esc(this.config)}</textarea>
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-head">
                        <h2>配置状态</h2>
                        <span>热重载</span>
                    </div>
                    <div class="panel-body list" id="config-state"></div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        const saveButton = this.findChild('button[onclick="saveConfig()"]');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.saveConfig());
        }

        const loadButton = this.findChild('button[onclick="loadConfig()"]');
        if (loadButton) {
            loadButton.addEventListener('click', () => this.loadConfig());
        }
    }

    afterRender() {
        this.updateConfigState();
    }

    updateConfig(config) {
        this.config = config;
        const editor = this.findChild('#config-editor');
        if (editor) {
            editor.value = config;
        }
    }

    updateConfigState() {
        const stateContainer = this.findChild('#config-state');
        if (stateContainer) {
            stateContainer.innerHTML = `
                <div class="row"><code>YAML parse</code><span class="state ok">已加载</span></div>
                <div class="row"><code>text.provider</code><span class="state ok">--</span></div>
                <div class="row"><code>multimodal.provider</code><span class="state ok">--</span></div>
                <div class="row"><code>api_key</code><span class="state ok">本地文件</span></div>
            `;
        }
    }

    async saveConfig() {
        const content = this.findChild('#config-editor').value;
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await response.json();

            if (data.ok) {
                this.showToast('配置已保存，下次请求自动生效');
                this.updateConfig('');
                await this.refresh();
            } else {
                this.showToast(data.error, true);
            }
        } catch (error) {
            this.showToast('保存配置失败', true);
        }
    }

    async loadConfig() {
        this.findChild('#config-editor').value = '';
        await this.refresh();
        this.showToast('已重新读取 config.yaml');
    }

    showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show${isError ? ' err' : ''}`;
        setTimeout(() => toast.classList.remove('show'), 2400);
    }

    async refresh() {
        // Trigger global refresh
        if (window.refresh) {
            await window.refresh();
        }
    }
}

export { ConfigEditor };
componentRegistry.register('ConfigEditor', ConfigEditor);