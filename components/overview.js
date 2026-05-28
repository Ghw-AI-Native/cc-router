import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * Overview 组件 — generates the full overview DOM (hero, strip, grid).
 * After initial render, data refresh is handled by main.js imperative updates.
 */
class Overview extends Component {
    constructor(selector) {
        super(selector);
        this.children = [];
    }

    template() {
        return `
            <div class="hero">
                <div class="status-hero">
                    <div>
                        <div class="eyebrow">LOCAL PROXY HEALTH</div>
                        <h1 id="hero-status">路由正常<span>。</span></h1>
                    </div>
                    <div class="hero-meta">
                        <div><strong id="hero-total">0</strong><span>总请求</span></div>
                        <div><strong id="hero-error-rate">0%</strong><span>错误率</span></div>
                        <div><strong id="hero-health">--</strong><span>/health</span></div>
                    </div>
                </div>
                <div class="route-board">
                    <div class="head"><h2>当前路由策略</h2><span>自动识别 \`type: "image"\` 内容块</span></div>
                    <div class="route-lanes">
                        <div class="lane"><div class="lane-title"><strong>Claude Code 请求</strong><span class="state ok">入口</span></div><div class="subtle-code">POST /v1/messages</div><div class="tags"><span class="tag blue">text</span><span class="tag violet">image</span><span class="tag green">stream</span></div></div>
                        <div class="route-arrow">→</div>
                        <div class="lane"><div class="lane-title"><strong>cc-router 判断</strong><span class="state ok">生效</span></div><div class="subtle-code">detect_images(body) → selected backend</div><div class="tags"><span class="tag amber">参数白名单</span><span class="tag green">SSE 透传</span></div></div>
                    </div>
                    <div class="head" style="border-top:1px solid var(--line);border-bottom:0"><div class="quick-actions"><button class="btn" onclick="refresh()">刷新</button><button class="btn" onclick="showView('config')">打开 config.yaml</button><button class="btn primary" onclick="copyEnv()">复制 Claude Code 环境变量</button></div></div>
                </div>
            </div>
            <div class="strip">
                <div class="metric ok"><div class="label"><span>服务状态</span><span class="state ok">200</span></div><div class="value" id="health-value">OK</div><div class="note">/health</div></div>
                <div class="metric"><div class="label"><span>总请求</span><span>当前进程</span></div><div class="value" id="total-value">0</div><div class="note">重启后重新计数</div></div>
                <div class="metric"><div class="label"><span>文本路由</span><span id="text-provider-label">--</span></div><div class="value" id="text-value">0</div><div class="note" id="text-share">0% 请求</div></div>
                <div class="metric warn"><div class="label"><span>图片路由</span><span id="image-provider-label">--</span></div><div class="value" id="image-value">0</div><div class="note" id="image-share">0% 请求</div></div>
                <div class="metric bad"><div class="label"><span>错误</span><span class="state warn">需关注</span></div><div class="value" id="error-value">0</div><div class="note" id="error-share">0% 错误率</div></div>
            </div>
            <div class="grid">
                <div>
                    <div class="panel">
                        <div class="panel-head">
                            <h2>后端配置摘要</h2>
                            <span>当前生效</span>
                        </div>
                        <div class="panel-body backend-pair">
                            <div class="backend" id="text-backend">
                                <!-- Text backend card will be rendered here -->
                            </div>
                            <div class="backend" id="image-backend">
                                <!-- Image backend card will be rendered here -->
                            </div>
                        </div>
                    </div>
                    <div class="panel table-wrap">
                        <div class="panel-head">
                            <h2>最近请求</h2>
                            <div class="filters">
                                <button class="active" onclick="filterLogs('all', this)">全部</button>
                                <button onclick="filterLogs('text', this)">文本</button>
                                <button onclick="filterLogs('multimodal', this)">图片</button>
                                <button onclick="filterLogs('error', this)">错误</button>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>时间</th>
                                    <th>类型</th>
                                    <th>来源模型</th>
                                    <th>路由后端</th>
                                    <th>状态</th>
                                </tr>
                            </thead>
                            <tbody id="recent-body">
                                <tr><td colspan="5">暂无记录</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <aside class="right-stack">
                    <div class="panel">
                        <div class="panel-head">
                            <h2>路由分布</h2>
                            <span>当前进程</span>
                        </div>
                        <div class="panel-body">
                            <div class="bar-row">
                                <span>文本</span>
                                <div class="track"><div class="fill text" id="bar-text"></div></div>
                                <strong id="bar-text-label">0</strong>
                            </div>
                            <div class="bar-row">
                                <span>图片</span>
                                <div class="track"><div class="fill image" id="bar-image"></div></div>
                                <strong id="bar-image-label">0</strong>
                            </div>
                            <div class="bar-row">
                                <span>流式</span>
                                <div class="track"><div class="fill stream" id="bar-stream"></div></div>
                                <strong id="bar-stream-label">--</strong>
                            </div>
                            <div class="bar-row">
                                <span>错误</span>
                                <div class="track"><div class="fill err" id="bar-error"></div></div>
                                <strong id="bar-error-label">0</strong>
                            </div>
                        </div>
                    </div>
                    <div class="panel">
                        <div class="panel-head">
                            <h2>配置热重载</h2>
                            <span>无需重启</span>
                        </div>
                        <div class="panel-body">
                            <div class="reload">
                                <div class="path" id="config-path">config.yaml</div>
                                <strong id="reload-big">--</strong>
                                <div id="reload-copy">等待读取配置</div>
                            </div>
                            <div class="list" id="key-list"></div>
                        </div>
                    </div>
                    <div class="panel">
                        <div class="panel-head">
                            <h2>API 快速检查</h2>
                            <span>本地端点</span>
                        </div>
                        <div class="panel-body list" id="api-mini"></div>
                    </div>
                </aside>
            </div>
        `;
    }

    bindEvents() {
        // Filter buttons events are handled globally
    }

    afterRender() {
        // Overview HTML (hero, strip, grid) is generated by template().
        // Data refresh is handled by main.js imperative updates — avoids
        // full re-render which would lose scroll/filter/editor state.
    }

    updateData(stats, textBackend, imageBackend, logs) {
        this.options = { ...this.options, stats, textBackend, imageBackend, logs };
    }
}

export { Overview };
componentRegistry.register('Overview', Overview);