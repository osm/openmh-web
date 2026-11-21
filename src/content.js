'use strict';

// The built-in collection is a deployment resource, never a deletable user file.
class OpenMHContent {
	static missingGame =
		'This game is no longer available in your library.';

	constructor(packages, use, unavailable = () => false) {
		this.packages = packages;
		this.requested =
			new URL(location.href).searchParams.get('content');
		this.use = use;
		this.unavailable = unavailable;
		this
			.urls = (document.querySelector(
						 'meta[name="openmh-assets"]')
					 ?.content ||
			'').split(';').filter(Boolean);
		this.label =
			document.querySelector(
					'meta[name="openmh-content-label"]')
				?.content ||
			'Included game';
		this.select = document.getElementById('game-content');
		this.status = document.getElementById('content-status');
		this.button = document.getElementById('use-content');
		this.defaultButton = document.getElementById('default-content');
		this.defaultButton.addEventListener(
			'click', () => this.setDefault());
		this.button.addEventListener('click', () => {
			if (!this.unavailable())
				this.use(this.select.value);
		});
		this.select.disabled = this.button.disabled =
			this.defaultButton.disabled = true;
		this.select.addEventListener('change', () => {
			if (this.unavailable()) {
				this.select.value = this.selection;
				return;
			}
			this.status.textContent = '';
			this.button.disabled = !this.select.value;
			this.selection = this.select.value;
			this.packages.select(this.selection);
			this.updateDefaultButton();
		});
	}

	preferred() {
		return this.requested ?? this.defaultValue();
	}

	defaultValue() {
		try {
			return localStorage.getItem('openmh-content') ||
				'builtin';
		} catch (_) {
			return 'builtin';
		}
	}

	setDefault() {
		if (this.unavailable() || !this.select.value)
			return;
		try {
			localStorage.setItem(
				'openmh-content', this.select.value);
			this.status.textContent = '';
			this.updateDefaultButton();
		} catch (_) {
			this.status.textContent =
				'Could not save the default game in this browser.';
		}
	}

	updateDefaultButton() {
		const saved = this.defaultValue();
		const options = [...this.select.options];
		const value = options.some((option) => option.value === saved)
			? saved
			: options[0]?.value;
		const selected = this.select.value === value;
		this.defaultButton.textContent =
			selected ? 'Default game' : 'Set as default';
		this.defaultButton.disabled = !this.select.value || selected;
	}

	refresh(id, restoring = false) {
		const selected = id || this.select.value || this.preferred();
		this.select.replaceChildren();
		if (this.urls.length)
			this.select.add(new Option(this.label, 'builtin'));
		for (const game of this.packages.library) {
			const names = OpenMHPackageDatabase.entries(game).map(
				(entry) => entry.name);
			this.select.add(new Option(names.join(' + '), game.id));
		}
		this.select.value = selected;
		const missing = (restoring || !this.selection) &&
			selected === this.requested && !this.select.value;
		if (!missing && !this.select.value &&
			this.select.options.length)
			this.select.selectedIndex = 0;
		this.selection = this.select.value;
		this.packages.select(this.selection);
		this.select.disabled = !this.select.options.length;
		this.button.disabled = !this.select.value;
		this.updateDefaultButton();
		this.status.textContent = missing ? OpenMHContent.missingGame
			: this.select.value	  ? ''
					    : 'Add your game files to begin.';
	}

	open(value, frontend) {
		const url = new URL('play/', document.baseURI);
		url.searchParams.set('content', value);
		if (frontend === 'original')
			url.searchParams.set('frontend', frontend);
		location.assign(url);
	}
}
