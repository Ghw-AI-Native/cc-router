import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * Header 组件
 */
class Header extends Component {
    constructor(selector) {
        super(selector);
    }

    template() {
        return `
            <div class="brand">
                <div class="mark"></div>
                <div>
                    <strong>cc-router 控制台</strong>
                    <code>http://127.0.0.1:8082/status</code>
                </div>
            </div>
            <div class="signals">
                <span class="signal">
                    <span class="pulse"></span>
                    <span id="service-signal">代理运行中</span>
                </span>
                <span class="signal">Python 3.10+</span>
                <span class="signal" id="reload-signal">config.yaml 等待加载</span>
            </div>
        `;
    }

    bindEvents() {
        // No specific events for header
    }

    afterRender() {
        // Update signals based on app state
    }
}

export { Header };
componentRegistry.register('Header', Header);