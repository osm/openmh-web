'use strict';

class OpenMHSaveTools {
	constructor(runtime, resetData, unavailable = () => false) {
		this.resetData = resetData;
		this.unavailable = unavailable;
		this.runtime = runtime;
		this.section = document.getElementById('save-tools');
		this.status = document.getElementById('save-status');
		this.exportButton = document.getElementById('export-saves');
		this.importInput = document.getElementById('import-saves');
		this.bindReset();
		this.exportButton.addEventListener(
			'click', () => this.run(() => this.export()));
		this.importInput.addEventListener('change', () => {
			const file = this.importInput.files[0];
			this.importInput.value = '';
			if (file)
				this.run(() => this.import(file));
		});
	}

	bindReset() {
		this.resetButton = document.getElementById('reset-data');
		this.resetDialog = document.getElementById('reset-dialog');
		this.resetForm = document.getElementById('reset-form');
		this.resetStatus = document.getElementById('reset-status');
		this.resetConfirm = document.getElementById('reset-confirm');
		this.resetButton.addEventListener('click', () => {
			if (this.busy || this.unavailable())
				return;
			this.resetForm.reset();
			this.resetStatus.textContent = '';
			this.updateResetSelection();
			this.resetDialog.showModal();
		});
		this.resetForm.addEventListener(
			'change', () => this.updateResetSelection());
		document.getElementById('reset-all')
			.addEventListener('click', () => {
				for (const input of this.resetChoices())
					input.checked = true;
				this.updateResetSelection();
			});
		document.getElementById('reset-cancel')
			.addEventListener(
				'click', () => this.resetDialog.close());
		this.resetDialog.addEventListener('cancel', (event) => {
			if (this.busy)
				event.preventDefault();
		});
		this.resetForm.addEventListener('submit', (event) => {
			event.preventDefault();
			const selected =
				this.resetChoices()
					.filter((input) => input.checked)
					.map((input) => input.name);
			if (selected.length)
				this.run(async () => {
					this.resetStatus.textContent =
						'Resetting selected data…';
					await this.resetData(selected);
				});
		});
	}

	resetChoices() {
		return Array.from(this.resetForm.querySelectorAll(
			'input[type="checkbox"]'));
	}

	updateResetSelection() {
		this.resetConfirm.disabled = this.busy ||
			!this.resetChoices().some((input) => input.checked);
	}

	setBusy(busy) {
		this.busy = busy;
		this.exportButton.disabled = this.importInput.disabled =
			this.resetButton.disabled = busy;
		for (const control of this.resetForm.querySelectorAll(
			     'button, fieldset'))
			control.disabled = busy;
		this.updateResetSelection();
	}

	async run(operation) {
		if (this.busy)
			return;
		const status =
			this.resetDialog.open ? this.resetStatus : this.status;
		if (this.unavailable()) {
			status.textContent =
				'Wait for the current operation to finish before managing saves.';
			return;
		}
		const assets = document.getElementById('assets');
		const assetsDisabled = assets.disabled;
		this.setBusy(true);
		assets.disabled = true;
		try {
			await operation();
		} catch (error) {
			status.textContent = error.message || String(error);
		} finally {
			this.setBusy(false);
			assets.disabled = assetsDisabled;
		}
	}

	async export() {
		this.status.textContent = 'Preparing save backup…';
		const game = await this.runtime();
		const snapshot = await game.exportSnapshot();
		OpenMHSaveTools.download(await OpenMHBackup.encode(
			snapshot || {version: 1, entries: []}));
		this.status.textContent = 'Save backup downloaded.';
	}

	async import(file) {
		this.status.textContent = 'Checking save backup…';
		const snapshot = await OpenMHBackup.decode(file);
		if (!window.confirm(
			    'Replace browser saves with this backup? Export your current saves first if you want to keep them.')) {
			this.status.textContent =
				'Import cancelled. Browser saves are unchanged.';
			return;
		}
		this.status.textContent = 'Importing saves…';
		const game = await this.runtime();
		await game.replaceSnapshotAndClose(snapshot);
		this.reload();
	}

	reload() {
		this.setBusy(false);
		location.reload();
	}

	static download(blob) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'openmotor-saves.omsave';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}
