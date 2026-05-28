import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * StatsCard 组件
 */
class StatsCard extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
        this.stats = options.stats || {};
    }

    template() {
        const { total, text, multimodal, errors, errorRate, health } = this.stats;
        return `
            <div class="metric ${health === 'OK' ? 'ok' : health === 'ERR' ? 'bad' : 'warn'}">
                <div class="label">
                    <span>服务状态</span>
                    <span class="state ${health === 'OK' ? 'good' : health === 'ERR' ? 'fail' : 'warn'}">${health}</span>
                </div>
                <div class="value">${health}</div>
                <div class="note">/health</div>
            </div>
            <div class="metric">
                <div class="label">
                    <span>总请求</span>
                    <span>当前进程</span>
                </div>
                <div class="value">${total}</div>
                <div class="note">重启后重新计数</div>
            </div>
            <div class="metric">
                <div class="label">
                    <span>文本路由</span>
                    <span id="text-provider-label">--</span>
                </div>
                <div class="value" id="text-value">${text || 0}</div>
                <div class="note" id="text-share">${text ? `${Math.round(text / total * 100)}% 请求` : '0% 请求'}</div>
            </div>
            <div class="metric warn">
                <div class="label">
                    <span>图片路由</span>
                    <span id="image-provider-label">--</span>
                </div>
                <div class="value" id="image-value">${multimodal || 0}</div>
                <div class="note" id="image-share">${multimodal ? `${Math.round(multimodal / total * 100)}% 请求` : '0% 请求'}</div>
            </div>
            <div class="metric bad">
                <div class="label">
                    <span>错误</span>
                    <span class="state warn">需关注</span>
                </div>
                <div class="value" id="error-value">${errors}</div>
                <div class="note" id="error-share">${errorRate ? `${errorRate}% 错误率` : '0% 错误率'}</div>
            </div>
        `;
    }

    bindEvents() {
        // No specific events for stats card
    }

    afterRender() {
        // Update stats display
    }

    updateStats(stats) {
        this.stats = stats;
        this.render();
    }
}

export { StatsCard };
componentRegistry.register('StatsCard', StatsCard);