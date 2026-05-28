import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * BackendCard 组件
 */
class BackendCard extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
        this.backend = options.backend || {};
    }

    template() {
        const { provider, model, name, url } = this.backend;
        return `
            <div class="backend">
                <h3>${name}</h3>
                ${this.kv('供应商', provider)}
                ${this.kv('模型', model)}
                ${this.kv('名称', name)}
                ${this.kv('端点', url)}
            </div>
        `;
    }

    kv(key, value) {
        return `<div class="kv"><span>${esc(key)}</span><span>${esc(value)}</span></div>`;
    }

    bindEvents() {
        // No specific events for backend card
    }

    afterRender() {
        // No additional setup needed
    }

    updateBackend(backend) {
        this.backend = backend;
        this.render();
    }
}

export { BackendCard };
componentRegistry.register('BackendCard', BackendCard);