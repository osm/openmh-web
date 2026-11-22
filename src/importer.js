'use strict';

class OpenMHImporter {
	constructor(packages, play, unavailable) {
		this.packages = packages;
		this.play = play;
		this.unavailable = unavailable;
		this.workerURL =
			document.querySelector('meta[name="openmh-extractor"]')
				?.content;
		this.form = document.getElementById('prepare-game');
		this.source = document.getElementById('prepare-source');
		this.patch = document.getElementById('prepare-patch');
		this.status = document.getElementById('prepare-status');
		this.start = document.getElementById('prepare-start');
		this.progressView = new OpenMHImportProgress();
		this.progress = this.progressView.bar;
		this.cancel = document.getElementById('prepare-cancel');
		this.files = [];
		this.cancel.addEventListener('click', () => this.abort());
		if (!this.workerURL)
			return;

		const input = document.getElementById('assets');
		input.accept = '.ass,.exe,.iso,.toc,.cue,.bin';
		input.multiple = true;
		const additions = document.getElementById('add-packages');
		if (additions)
			additions.accept = '.ass,.exe';
		const hint = document.getElementById('import-hint');
		if (hint)
			hint.hidden = false;
		this.start.addEventListener('click', () => this.prepare());
		this.source.addEventListener(
			'change', () => this.selectPatch());
		document.getElementById('prepare-add-update')
			.addEventListener('change', (event) => {
				this.select(event.target.files);
				event.target.value = '';
			});
	}

	selectPatch(selected = null) {
		this.updateOptions();
		this.patch.replaceChildren(new Option('No update', ''));
		for (const file of this.files) {
			if (!/\.exe$/i.test(file.name) ||
				file.name === this.source.value)
				continue;
			this.patch.add(new Option(file.name, file.name));
			if (/^motorp30\.exe$/i.test(file.name))
				this.patch.value = file.name;
		}
		if (selected !== null &&
			Array.from(this.patch.options)
				.some((option) => option.value === selected))
			this.patch.value = selected;
	}

	updateOptions() {
		const unchanged = /\.ass$/i.test(this.source.value);
		for (const id of ['prepare-no-music', 'prepare-no-movies'])
			document.getElementById(id).disabled =
				this.busy || unchanged;
	}

	select(files, target = null) {
		if (this.busy || this.unavailable() || !files.length)
			return;
		if (this.form.hidden && this.updateGame) {
			const update = this.updateGame;
			this.clearUpdate();
			if (Array.from(files).every(
				    file => /^motorp30\.exe$/i.test(
					    file.name))) {
				files = [...update.files, ...files];
				target = update.record;
			}
		}
		if ((this.form.hidden || !this.workerURL) &&
			Array.from(files).every(
				(file) => /\.ass$/i.test(file.name))) {
			this.play(Array.from(files), true, target);
			return;
		}
		if (!this.workerURL) {
			this.status.textContent =
				'This deployment cannot prepare installers. Use the native extractor, then add its .ass packages.';
			this.openForm();
			this.start.disabled = true;
			return;
		}

		const adding = !this.form.hidden;
		const update = adding ? this.patch.value : null;
		if (!adding) {
			this.target = target;
			this.files = [];
			this.source.replaceChildren();
			this.patch.replaceChildren();
		}
		this.openForm();
		try {
			this.validateFiles(files);
			// Additional drops belong to the open preparation. A reselected
			// filename replaces its previous file without duplicating it.
			const previous = adding ? this.files : [];
			const selected = new Map(previous.map(
				(file) => [file.name.toLowerCase(), file]));
			for (const file of files)
				selected.set(file.name.toLowerCase(), file);
			this.files = [...selected.values()];
		} catch (error) {
			if (!adding)
				this.start.disabled = true;
			this.status.textContent = error.message;
			return;
		}
		this.selectSource();
		const newUpdate = Array.from(files).some(
			(file) => /^motorp30\.exe$/i.test(file.name));
		this.selectPatch(newUpdate ? null : update);
		this.start.disabled = !this.source.value;
		this.status.textContent = this.source.value
			? ''
			: 'Select a base game too. For a disc image, include its TOC or CUE and all referenced BIN files.';
	}

	openForm() {
		if (!this.form.hidden)
			return;
		this.form.hidden = false;
		this.progressView.reset();
		this.form.querySelector('h3').focus({preventScroll: true});
		this.form.scrollIntoView({
			block: 'start',
			behavior: matchMedia('(prefers-reduced-motion: reduce)')
					  .matches
				? 'auto'
				: 'smooth'
		});
	}

	selectSource() {
		const selected = this.source.value;
		this.source.replaceChildren();
		for (const file of this.files) {
			if (/\.(ass|iso|toc|cue|exe)$/i.test(file.name) &&
				!/^motorp30\.exe$/i.test(file.name))
				this.source.add(
					new Option(file.name, file.name));
		}
		if (Array.from(this.source.options)
				.some((option) => option.value === selected))
			this.source.value = selected;
	}

	validateFiles(files) {
		const names = new Set();
		for (const file of files) {
			if (!file.name || file.name === '.' ||
				file.name === '..' || /[\\/]/.test(file.name) ||
				names.has(file.name.toLowerCase())) {
				throw new Error(
					'Select files with unique filenames from one source.');
			}
			names.add(file.name.toLowerCase());
		}
	}

	setBusy(busy) {
		this.busy = busy;
		if (busy)
			this.progressView.start();
		else
			this.progressView.stop();
		this.form.setAttribute('aria-busy', String(busy));
		this.packages.busy = busy;
		for (const element of this.form.querySelectorAll(
			     'input, select, button'))
			element.disabled = busy;
		this.cancel.disabled = false;
		document.getElementById('assets').disabled = busy;
		this.updateOptions();
	}

	abort() {
		if (this.busy)
			this.controller?.abort();
		else {
			this.form.hidden = true;
			this.clearUpdate();
		}
	}

	clearUpdate() {
		this.updateGame = null;
		const label = document.getElementById('prepare-target');
		if (label)
			label.hidden = true;
	}

	request() {
		if (!this.source.value)
			throw new Error('Choose a base game.');
		if (/\.ass$/i.test(this.source.value) && !this.patch.value)
			throw new Error(
				'Choose a patch to apply to this package, or load the .ass directly.');
		return {
			files: this.files,
			source: this.source.value,
			patch: this.patch.value,
			combinePatch: true,
			compact: true,
			excludeMusic: !/\.ass$/i.test(this.source.value) &&
				document.getElementById('prepare-no-music')
					.checked,
			excludeMovies: !/\.ass$/i.test(this.source.value) &&
				document.getElementById('prepare-no-movies')
					.checked
		};
	}

	async publish(selection, name) {
		this.cancel.disabled = true;
		const files =
			Array.isArray(selection) ? selection : [selection];
		return this.packages.storePrepared(
			files.map((file, index) => new File([file],
					  index === 0 ? name : file.name)),
			(progress) => this.progressView.update(progress),
			this.target);
	}

	async prepare() {
		if (this.busy || this.unavailable())
			return;
		let prepared;
		try {
			const request = this.request();
			const name =
				request.source.replace(/\.[^.]+$/, '') + '.ass';
			this.setBusy(true);
			this.controller = new AbortController();
			this.status.textContent = '';
			prepared =
				await new OpenMHExtractionJob(this.workerURL)
					.run(request,
						this.controller.signal,
						(progress) => this.progressView
							.update(progress),
						(file) => this.publish(
							file, name));
		} catch (error) {
			this.status.textContent = error.name === 'AbortError'
				? 'Preparation cancelled. Your previous package is kept.'
				: error.message;
		} finally {
			this.setBusy(false);
		}
		if (prepared) {
			this.form.hidden = true;
			this.play(prepared, false);
		}
	}
}
