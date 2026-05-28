import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * LogTable 组件
 */
class LogTable extends Component {
    constructor(selector, options = {}) {
        super(selector, options);
        this.logs = options.logs || [];
        this.filter = 'all';
    }

    template() {
        const logs = this.filterLogs();
        return `
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
                        ${logs.map(log => this.logRow(log)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    filterLogs() {
        switch (this.filter) {
            case 'text':
                return this.logs.filter(log => log.route === 'text');
            case 'multimodal':
                return this.logs.filter(log => log.route === 'multimodal');
            case 'error':
                return this.logs.filter(log => log.status >= 300);
            default:
                return this.logs;
        }
    }

    logRow(log) {
        const type = (log.status >= 300 ? 'error ' : '') + (log.route || 'text');
        return `
            <tr data-type="${esc(type)}">
                <td class="mono">${esc(log.time)}</td>
                <td>${this.routeTag(log.route)}</td>
                <td class="mono">${esc(log.source_model)}</td>
                <td>${esc(log.backend)}</td>
                <td>${this.statusTag(log.status)}</td>
            </tr>
        `;
    }

    routeTag(route) {
        return route === 'multimodal'
            ? '<span class="tag violet">image</span>'
            : `<span class="tag blue">${esc(route || 'text')}</span>`;
    }

    statusTag(status) {
        const ok = Number(status) < 300;
        return `<span class="status ${ok ? 'good' : 'fail'}">${ok ? 'OK' : 'ERR'} ${esc(status)}</span>`;
    }

    bindEvents() {
        // Filter buttons events are handled globally
    }

    afterRender() {
        // Initialize filter buttons
    }

    updateLogs(logs) {
        this.logs = logs;
        this.render();
    }

    setFilter(filter) {
        this.filter = filter;
        this.render();
    }
}

export { LogTable };
componentRegistry.register('LogTable', LogTable);