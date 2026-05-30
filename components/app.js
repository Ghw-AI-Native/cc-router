import { Component, componentRegistry, $, $$ } from '../components.js';

/**
 * App 根组件
 */
class App extends Component {
    constructor() {
        super('#app');
        this.children = [];
        this.currentView = 'overview';
    }

    template() {
        return `
            <div class="product">
                <header class="topbar">
                    <div class="brand">
                        <div class="mark">cc</div>
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
                        <button class="theme-toggle" onclick="cycleTheme()" title="切换主题">
                            <span id="theme-icon">◐</span>
                        </button>
                    </div>
                </header>
                <div class="app">
                    <aside class="rail">
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
                    </aside>
                    <main class="main">
                        <section class="view active" id="overview"><!-- populated by Overview.render() --></section>
                        <section class="view" id="logs">
                            <div class="section-head"><div><h1>路由日志</h1><p>定位"这次请求为什么走这个模型"。</p></div><div class="quick-actions"><button class="btn" onclick="copyRecent()">复制日志 JSON</button><button class="btn primary" onclick="filterLogs('error',null,'#logs')">只看错误</button></div></div>
                            <div class="panel table-wrap"><div class="panel-head"><h2>最近 50 条路由决策</h2><div class="filters"><button class="active" onclick="filterLogs('all',this,'#logs')">全部</button><button onclick="filterLogs('text',this,'#logs')">文本</button><button onclick="filterLogs('multimodal',this,'#logs')">图片</button><button onclick="filterLogs('error',this,'#logs')">错误</button></div></div><table><thead><tr><th>时间</th><th>检测结果</th><th>来源模型</th><th>目标模型</th><th>供应商</th><th>状态</th></tr></thead><tbody id="logs-body"><tr><td colspan="6">暂无记录</td></tr></tbody></table></div>
                        </section>
                        <section class="view" id="providers">
                            <div class="section-head"><div><h1>供应商</h1><p>当前启用与可选预设分开看。</p></div><div class="quick-actions"><button class="btn" onclick="refreshPresets()">刷新预设</button><button class="btn primary" onclick="showView('config')">去配置</button></div></div><div class="provider-grid" id="provider-grid"></div>
                        </section>
                        <section class="view" id="config">
                            <div class="section-head"><div><h1>配置</h1><p>保留 YAML 编辑心智，同时暴露 key 状态、热重载结果和风险项。</p></div><div class="quick-actions"><button class="btn" onclick="loadConfig()">重新读取</button><button class="btn primary" onclick="saveConfig()">保存并热重载</button></div></div>
                            <div class="config-layout"><div class="panel"><div class="panel-head"><h2>config.yaml</h2><span>本地文件</span></div><div class="panel-body"><textarea class="editor" id="config-editor" spellcheck="false"></textarea></div></div><div class="panel"><div class="panel-head"><h2>配置状态</h2><span>热重载</span></div><div class="panel-body list" id="config-state"></div></div></div>
                        </section>
                        <section class="view" id="api">
                            <div class="section-head"><div><h1>API 检查</h1><p>把 README 里的验证命令变成页面里可读的健康结果。</p></div><div class="quick-actions"><button class="btn" onclick="copyCurl()">复制 curl</button><button class="btn primary" onclick="refresh()">全部重跑</button></div></div>
                            <div class="api-grid" id="api-grid"></div>
                        </section>
                        <section class="view" id="whitelist">
                            <div class="section-head"><div><h1>参数白名单</h1><p>解释为什么有些参数会被转发、有些会被过滤。</p></div><div class="quick-actions"><button class="btn" onclick="showView('providers')">查看供应商</button><button class="btn primary" onclick="showView('logs')">看路由日志</button></div></div>
                            <div class="panel table-wrap"><div class="panel-head"><h2>当前启用后端的参数策略</h2><span>model 始终替换为目标模型</span></div><table><thead><tr><th>provider</th><th>保留参数示例</th><th>认证头</th><th>说明</th></tr></thead><tbody><tr><td class="mono">deepseek</td><td><span class="tag">messages</span> <span class="tag">max_tokens</span> <span class="tag">stream</span> <span class="tag">tools</span> <span class="tag">thinking</span></td><td><code>x-api-key</code></td><td>当前文本后端</td></tr><tr><td class="mono">dashscope</td><td><span class="tag">messages</span> <span class="tag">top_k</span> <span class="tag">stream</span> <span class="tag">tools</span></td><td><code>Authorization: Bearer</code></td><td>当前多模态后端</td></tr><tr><td class="mono">anthropic</td><td><span class="tag">metadata</span> <span class="tag">thinking</span> <span class="tag">tool_choice</span></td><td><code>x-api-key</code></td><td>官方兼容兜底</td></tr></tbody></table></div>
                        </section>
                    </main>
                </div>
            </div>
            <div class="toast" id="toast"></div>
            <div class="provider-modal" id="provider-modal"></div>
        `;
    }

    bindEvents() {
        // View switching events are handled globally
    }

    afterRender() {
        // DOM already rendered by template(); child components (Header, Sidebar,
        // MainContent) receive their content from App's static HTML shell.
    }
}

export { App };
componentRegistry.register('App', App);