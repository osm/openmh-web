'use strict';

class OpenMHPackages extends OpenMHPackageStore {
	constructor(play, forgotten = () => {}) {
		super();
		this.forgotten = forgotten;
		this.unavailable = () => false;
		this.list = document.getElementById('package-files');
		this.section = document.getElementById('remembered-package');
		this.status = document.getElementById('package-status');
		this.playButton = document.getElementById('play-package');
		this.forgetButton = document.getElementById('forget-package');
		this.forgetCurrentButton =
			document.getElementById('forget-current-package');
		this.playButton.addEventListener('click', () => {
			if (!this.busy && this.file)
				play(this.files);
		});
		this.forgetButton.addEventListener(
			'click', () => this.forget());
		this.forgetCurrentButton.addEventListener(
			'click', () => this.forget());
		this.ready = this.restore();
	}

	show() {
		this.section.hidden = !this.files.length;
		OpenMHPackageDownloads.clear(this.list);
		for (const file of this.files) {
			const item = document.createElement('li');
			const actions = document.createElement('div');
			actions.className = 'button-row';
			const download =
				OpenMHPackageDownloads.link(file, 'Download');
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = 'Remove';
			button.setAttribute(
				'aria-label', 'Remove ' + file.name);
			button.addEventListener(
				'click', () => this.removeFile(file.name));
			const name = document.createElement('span');
			name.textContent = file.name;
			actions.append(download, button);
			item.append(name, actions);
			this.list.append(item);
		}
	}

	select(id) {
		super.select(id);
		this.forgetCurrentButton.hidden = true;
		this.show();
		const prepare = document.getElementById('prepare-package');
		if (prepare) {
			const url = new URL(
				'game-files/#prepare', document.baseURI);
			url.searchParams.set('content', this.id);
			prepare.href = url;
		}
	}

	showCurrent(files, remembered) {
		for (const link of this.list.querySelectorAll('a[download]'))
			link.hidden = !remembered;
		const selection = Array.isArray(files) ? files : [files];
		this.forgetCurrentButton.textContent = selection.length === 1
			? 'Forget ' + selection[0].name
			: 'Forget game packages';
		this.forgetCurrentButton.hidden = !remembered;
	}

	async removeFile(name) {
		if (this.busy || this.unavailable() || !this.id)
			return;
		this.busy = true;
		try {
			const files =
				this.files.filter((file) => file.name !== name);
			if (files.length)
				await this.saveFiles(files, this.record);
			else
				await this.remove();
			this.status.textContent =
				'Package removed. Your saves are kept.';
		} catch (error) {
			this.status.textContent = error.message;
		} finally {
			this.busy = false;
		}
	}

	async restore() {
		try {
			await super.restore();
			this.status.textContent = '';
		} catch (error) {
			this.status.textContent =
				'Could not restore a package. Choose a file to play. ' +
				error.message;
			this.onChange();
		}
	}

	watchLibrary() {
		const sync = async () => {
			try {
				await this.ready;
				await this.refresh();
			} catch (error) {
				this.status.textContent = error.message;
			}
		};
		OpenMHPackageStore.changes?.addEventListener('message', sync);
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden)
				sync();
		});
		window.addEventListener('pageshow', (event) => {
			if (event.persisted)
				sync();
		});
	}

	bindInput(select, unavailable = () => false) {
		const choose = (files, append = false) => {
			if (this.busy || unavailable() || !files.length)
				return;
			const selection =
				append ? [...this.files, ...files] : [...files];
			select(selection, append ? this.record : null);
		};
		new OpenMHPackageInput(
			choose, () => this.busy || unavailable());
	}

	async remember(selection, target = null) {
		await this.ready;
		if (this.busy)
			return false;
		this.busy = true;
		this.status.textContent = 'Remembering package…';
		try {
			const files = Array.isArray(selection) ? selection
							       : [selection];
			OpenMHPackageStore.validateSelection(files);
			await this.writeFiles(files, target);
			this.status.textContent =
				'Package remembered in this browser.';
			return true;
		} catch (error) {
			this.status.textContent =
				'Playing without remembering this package. ' +
				'Browser storage may be full or unavailable. ' +
				error.message;
			return false;
		} finally {
			this.busy = false;
		}
	}

	async forget() {
		if (this.busy || this.unavailable() || !this.id)
			return;
		this.busy = true;
		this.playButton.disabled = this.forgetButton.disabled =
			this.forgetCurrentButton.disabled = true;
		try {
			await this.remove();
			this.status.textContent =
				'Package forgotten. Your saves are kept.';
		} catch (error) {
			this.status.textContent =
				'Could not forget the package. ' +
				error.message;
			return;
		} finally {
			this.busy = false;
			this.playButton.disabled = this.forgetButton.disabled =
				this.forgetCurrentButton.disabled = false;
		}
		this.forgotten();
	}
}
