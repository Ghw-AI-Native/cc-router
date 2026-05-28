import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * RouteBoard 组件
 */
class RouteBoard extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
    }

    template() {
        return `
            <div class="route-board">
                <div class="head">
                    <h2>当前路由策略</h2>
                    <span>自动识别 \`type: "image"\` 内容块</span>
                </div>
                <div class="route-lanes">
                    <div class="lane">
                        <div class="lane-title">
                            <strong>Claude Code 请求</strong>
                            <span class="state ok">入口</span>
                        </div>
                        <div class="subtle-code">POST /v1/messages</div>
                        <div class="tags">
                            <span class="tag blue">text</span>
                            <span class="tag violet">image</span>
                            <span class="tag green">stream</span>
                        </div>
                    </div>
                    <div class="route-arrow">→</div>
                    <div class="lane">
                        <div class="lane-title">
                            <strong>cc-router 判断</strong>
                            <span class="state ok">生效</span>
                        </div>
                        <div class="subtle-code">detect_images(body) → selected backend</div>
                        <div class="tags">
                            <span class="tag amber">参数白名单</span>
                            <span class="tag green">SSE 透传</span>
                        </div>
                    </div>
                </div>
                <div class="head" style="border-top:1px solid var(--line);border-bottom:0">
                    <div class="quick-actions">
                        <button class="btn" onclick="refresh()">刷新</button>
                        <button class="btn" onclick="showView('config')">打开 config.yaml</button>
                        <button class="btn primary" onclick="copyEnv()">复制 Claude Code 环境变量</button>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Quick actions events
    }

    afterRender() {
        // Initialize quick actions
    }
}

export { RouteBoard };
componentRegistry.register('RouteBoard', RouteBoard);