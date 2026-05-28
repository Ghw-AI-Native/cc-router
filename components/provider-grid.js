import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * ProviderGrid 组件
 */
class ProviderGrid extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
        this.providers = options.providers || {};
        this.activeProviders = options.activeProviders || new Set();
    }

    template() {
        const entries = Object.entries(this.providers);
        return `
            <div class="provider-grid" id="provider-grid">
                ${entries.map(([key, provider]) => this.providerCard(key, provider)).join('')}
            </div>
        `;
    }

    providerCard(key, provider) {
        const isActive = this.activeProviders.has(key);
        return `
            <div class="provider ${isActive ? 'active' : ''}">
                <h3>${esc(provider.name)}</h3>
                <p>${key === this.activeProviders.text ? '当前文本后端。' : key === this.activeProviders.multimodal ? '当前多模态后端。' : '可选供应商预设。'}</p>
                <div class="tags">
                    <span class="tag ${isActive ? 'green' : ''}">${isActive ? 'active' : 'preset'}</span>
                    <span class="tag">${esc(provider.auth)}</span>
                </div>
                <div class="base">${esc(provider.base_url)}</div>
            </div>
        `;
    }

    bindEvents() {
        // No specific events for provider grid
    }

    afterRender() {
        // No additional setup needed
    }

    updateProviders(providers, activeProviders) {
        this.providers = providers;
        this.activeProviders = activeProviders;
        this.render();
    }
}

export { ProviderGrid };
componentRegistry.register('ProviderGrid', ProviderGrid);