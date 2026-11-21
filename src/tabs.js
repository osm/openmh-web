'use strict';

class OpenMHTabs {
	constructor(
		list, {preserveUnknown = false, onBlocked = () => {}} = {}) {
		this.list = list;
		this.onBlocked = onBlocked;
		this.restrictedPanel = null;
		this.preserveUnknown = preserveUnknown;
		this.tabs = [];
		this.children = new Map();
		this.parents = new Map();
		this.collectTabs(list);
		for (const tab of this.tabs) {
			tab.addEventListener('click',
				() => this.select(
					tab.getAttribute('aria-controls')));
			tab.addEventListener(
				'keydown', (event) => this.navigate(event));
		}
		this.restore();
		for (const event of ['popstate', 'hashchange'])
			window.addEventListener(event, () => this.restore());
	}

	collectTabs(list, parent = null) {
		const tabs = [...list.querySelectorAll('[role="tab"]')];
		if (parent)
			this.children.set(parent, tabs);
		for (const tab of tabs) {
			this.tabs.push(tab);
			this.parents.set(tab, parent);
			const panel = document.getElementById(
				tab.getAttribute('aria-controls'));
			const nested = panel.querySelector(
				':scope > [role="tablist"]');
			if (nested)
				this.collectTabs(nested, tab);
		}
	}

	selection(tab) {
		// A parent opens its first child; a child also selects its ancestors.
		while (this.children.has(tab))
			tab = this.children.get(tab)[0];
		const selected = [];
		for (; tab; tab = this.parents.get(tab))
			selected.push(tab);
		return selected;
	}

	restore() {
		const selected = this.tabs.find(
			(tab) => '#' + tab.dataset.route === location.hash);
		if (selected)
			this.select(selected.getAttribute('aria-controls'),
				false,
				'none');
		else if (!this.preserveUnknown || !location.hash)
			this.select(this.tabs[0].getAttribute('aria-controls'),
				false,
				this.list.closest('[hidden]') ? 'none'
							      : 'replace');
	}

	restrictTo(panel = null) {
		if (this.restrictedPanel === panel)
			return;
		this.restrictedPanel = panel;
		for (const tab of this.tabs) {
			const blocked = panel !== null &&
				tab.getAttribute('aria-controls') !== panel;
			if (blocked)
				tab.setAttribute('aria-disabled', 'true');
			else
				tab.removeAttribute('aria-disabled');
		}
		if (panel)
			this.select(panel, false, 'replace');
	}

	select(panel, focus = false, historyMode = 'push') {
		const requested = this.tabs.find(
			(tab) => tab.getAttribute('aria-controls') === panel);
		if (!requested)
			return;
		const selectedTabs = this.selection(requested);
		if (this.restrictedPanel &&
			!selectedTabs.some(
				(tab) => tab.getAttribute('aria-controls') ===
					this.restrictedPanel)) {
			// Restore navigation before the explanation takes keyboard focus.
			this.select(this.restrictedPanel, focus, 'replace');
			this.onBlocked();
			return;
		}
		const url = new URL(location.href);
		url.hash = selectedTabs[0].dataset.route;
		if (historyMode !== 'none' && url.href !== location.href)
			history[historyMode + 'State'](null, '', url);
		for (const tab of this.tabs) {
			const target = tab.getAttribute('aria-controls');
			const selected = selectedTabs.includes(tab);
			tab.setAttribute('aria-selected', String(selected));
			tab.tabIndex = selected ? 0 : -1;
			document.getElementById(target).hidden = !selected;
			if (tab === requested && focus)
				tab.focus();
		}
	}

	navigate(event) {
		const tabs = [...event.currentTarget.closest('[role="tablist"]')
				.querySelectorAll('[role="tab"]')];
		const index = tabs.indexOf(event.currentTarget);
		const destinations = {
			ArrowLeft: (index + tabs.length - 1) % tabs.length,
			ArrowRight: (index + 1) % tabs.length,
			Home: 0,
			End: tabs.length - 1
		};
		if (!Object.hasOwn(destinations, event.key))
			return;
		event.preventDefault();
		this.select(tabs[destinations[event.key]].getAttribute(
				    'aria-controls'),
			true);
	}
}
