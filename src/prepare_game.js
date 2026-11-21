'use strict';

class OpenMHPreparation {
	constructor(packages, showLibrary) {
		this.packages = packages;
		this.showLibrary = showLibrary;
		this.result = document.getElementById('prepared-game');
		this.status = document.getElementById('import-status');
		this.downloads = document.getElementById('prepared-downloads');
		this.importer = new OpenMHImporter(packages,
			(files, remember, target) =>
				this.finish(files, remember, target),
			() => packages.busy);
		document.getElementById('add-packages').accept = '.ass';
		document.getElementById('prepare-package')
			.addEventListener('click', (event) => {
				const url = new URL(event.currentTarget.href);
				if (this.packages.busy)
					event.preventDefault();
				else if (url.search === location.search)
					this.showTarget(url.searchParams.get(
						'content'));
			});
		document.getElementById('view-prepared')
			.addEventListener('click', (event) => {
				if (event.ctrlKey || event.metaKey ||
					event.shiftKey || event.altKey)
					return;
				event.preventDefault();
				this.openLibrary(event.currentTarget.href);
			});
	}

	async openLibrary(href) {
		if (this.packages.busy)
			return;
		try {
			const id = new URL(href).searchParams.get('content');
			await this.packages.refresh(id);
			if (this.packages.id !== id) {
				this.status.textContent =
					OpenMHContent.missingGame;
				return;
			}
			this.showLibrary(href, id);
		} catch (error) {
			this.status.textContent = error.message;
		}
	}

	showTarget(id = this.packages.id) {
		if (this.packages.busy)
			return;
		this.importer.abort();
		const target = document.getElementById('prepare-target');
		if (!this.packages.file || this.packages.id !== id) {
			this.status.textContent = OpenMHContent.missingGame;
			return;
		}
		this.status.textContent = '';
		this.importer.updateGame = {
			record: this.packages.record,
			files: this.packages.files.slice()
		};
		target.textContent = 'Updating ' + this.packages.file.name +
			'. Choose the update file below.';
		target.hidden = false;
	}

	clearResult() {
		this.record = null;
		this.result.hidden = true;
		OpenMHPackageDownloads.clear(this.downloads);
	}

	checkRecords() {
		const current = record => this.packages.library.some(
			game => OpenMHPackageDatabase.matches(game, record));
		if (this.record && !current(this.record))
			this.clearResult();
		const update = this.importer.updateGame;
		if (update && !current(update.record)) {
			this.importer.clearUpdate();
			this.status.textContent =
				'The game selected for update has changed. Select it again in the library.';
		}
	}

	select(files, target = null) {
		this.clearResult();
		this.status.textContent = '';
		this.importer.select(files, target);
	}

	showPrepared() {
		this.clearResult();
		this.record = this.packages.record;
		for (const [id, path] of [['play-prepared', 'play/'],
			     ['view-prepared', 'game-files/#library']]) {
			const url = new URL(path, document.baseURI);
			url.searchParams.set('content', this.packages.id);
			document.getElementById(id).href = url;
		}
		for (const file of this.packages.files)
			this.downloads.append(
				OpenMHPackageDownloads.link(file));
		this.result.hidden = false;
		document.getElementById('prepare-target').hidden = true;
		if (!document.getElementById('prepare-panel').hidden) {
			document.getElementById('prepared-heading').focus({
				preventScroll: true
			});
			this.result.scrollIntoView(
				{block: 'nearest', behavior: 'smooth'});
		}
	}

	async finish(files, remember = false, target = null) {
		this.status.textContent = '';
		try {
			if (remember) {
				this.importer.setBusy(true);
				this.status.textContent =
					'Adding game packages…';
				await this.packages.saveFiles(files, target);
			}
			this.status.textContent = '';
			this.showPrepared();
		} catch (error) {
			this.status.textContent = error.message;
		} finally {
			if (remember)
				this.importer.setBusy(false);
		}
	}
}
