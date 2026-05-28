/**
 * 组件基类
 */
class Component {
    constructor(selector, options = {}) {
        this.element = document.querySelector(selector);
        this.options = options;
        this.state = {};
        this.children = [];
    }

    /**
     * 渲染组件
     */
    render() {
        if (!this.element) return;
        this.element.innerHTML = this.template();
        this.bindEvents();
        this.afterRender();
    }

    /**
     * 组件模板（子类必须实现）
     */
    template() {
        return '';
    }

    /**
     * 绑定事件（子类可重写）
     */
    bindEvents() {}

    /**
     * 渲染后处理（子类可重写）
     */
    afterRender() {}

    /**
     * 更新状态并重新渲染
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.render();
    }

    /**
     * 查找子组件
     */
    findChild(selector) {
        return this.element.querySelector(selector);
    }

    /**
     * 查找所有子组件
     */
    findChildren(selector) {
        return Array.from(this.element.querySelectorAll(selector));
    }
}

/**
 * 组件注册表
 */
const componentRegistry = {
    components: {},

    register(name, ComponentClass) {
        this.components[name] = ComponentClass;
    },

    create(name, selector, options) {
        const ComponentClass = this.components[name];
        if (!ComponentClass) {
            throw new Error(`Component ${name} not registered`);
        }
        return new ComponentClass(selector, options);
    }
};

// 工具函数
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export { Component, componentRegistry, $, $$, esc };