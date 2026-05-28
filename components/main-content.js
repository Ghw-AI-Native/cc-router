import { Component, componentRegistry, $, esc } from '../components.js';

/**
 * MainContent 组件
 */
class MainContent extends Component {
    constructor(selector) {
        super(selector);
        this.currentView = 'overview';
    }

    template() {
        return `
            <section class="view active" id="overview">
                <!-- Overview content will be rendered by Overview component -->
            </section>
            <section class="view" id="logs">
                <!-- Logs content will be rendered by Logs component -->
            </section>
            <section class="view" id="providers">
                <!-- Providers content will be rendered by Providers component -->
            </section>
            <section class="view" id="config">
                <!-- Config content will be rendered by Config component -->
            </section>
            <section class="view" id="api">
                <!-- API content will be rendered by Api component -->
            </section>
            <section class="view" id="whitelist">
                <!-- Whitelist content will be rendered by Whitelist component -->
            </section>
        `;
    }

    bindEvents() {
        // View switching events are handled globally
    }

    afterRender() {
        // Initialize view components based on current view
        this.updateCurrentView();
    }

    updateCurrentView() {
        const viewId = this.currentView;
        const viewElement = $(`#${viewId}`);
        if (viewElement) {
            viewElement.classList.add('active');
        }
    }

    showView(viewId) {
        this.currentView = viewId;
        $$('section.view').forEach(section => {
            section.classList.toggle('active', section.id === viewId);
        });
    }
}

export { MainContent };
componentRegistry.register('MainContent', MainContent);