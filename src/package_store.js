'use strict';

class OpenMHPackageStore {
	static changes = typeof BroadcastChannel === 'function'
		? new BroadcastChannel('openmh-packages')
		: null;

	constructor() {
		this.files = [];
		this.library = [];
		this.id = null;
		this.onChange = (id = this.library[0]?.id) => this.select(id);
		this.database = new OpenMHPackageDatabase();
	}

	select(id) {
		const record = this.library.find((game) => game.id === id);
		this.record = record || null;
		this.id = record?.id || null;
		this.files = OpenMHPackageDatabase.entries(record).map(
			(entry) => new File([entry.blob], entry.name));
		this.file = this.files[0] || null;
	}

	async refresh(id) {
		const library = await this.database.list();
		const unchanged = (game, index) =>
			OpenMHPackageDatabase.matches(
				game, this.library[index]);
		if (id === undefined &&
			library.length === this.library.length &&
			library.every(unchanged))
			return;
		this.library = library;
		this.onChange(id === undefined ? this.id : id);
	}

	async changed(id) {
		OpenMHPackageStore.changes?.postMessage(null);
		await this.refresh(id);
	}

	async clear() {
		await this.database.clear();
		OpenMHPackageStore.changes?.postMessage(null);
		this.library = [];
		this.onChange();
	}

	async remove() {
		await this.database.remove(this.id, this.record);
		await this.changed();
	}

	async restore() {
		const library = await this.database.list();
		const entries = library.flatMap(OpenMHPackageDatabase.entries);
		for (const entry of entries)
			if (!(entry.blob instanceof Blob) ||
				typeof entry.name !== 'string' ||
				!/\.ass$/i.test(entry.name))
				throw new Error(
					'The remembered packages cannot be read. Choose them again.');
		this.library = library;
		this.onChange();
	}

	static validateSelection(files) {
		if (!files.length ||
			files.some((file) => !/\.ass$/i.test(file.name)))
			throw new Error(
				'Choose .ass packages, or use Prepare game files to convert a CD image or game download.');
		if (new Set(files.map((file) => file.name.toLowerCase()))
				.size !== files.length)
			throw new Error(
				'Choose packages with unique filenames.');
	}

	static async validatePackages(files) {
		OpenMHPackageStore.validateSelection(files);
		await OpenMHPackageDatabase.validate(files);
	}

	async saveFiles(files, target = null) {
		await OpenMHPackageStore.validatePackages(files);
		await this.writeFiles(files, target);
	}

	async writeFiles(files, target) {
		const id = target?.id || crypto.randomUUID();
		await this.database.writeCollection(files, id, target);
		await this.changed(id);
	}

	async storePrepared(selection, progress, target = null) {
		await this.ready;
		const files =
			Array.isArray(selection) ? selection : [selection];
		OpenMHPackageStore.validateSelection(files);
		const id = target?.id || crypto.randomUUID();
		await this.database.importCollection(
			files, progress, id, target);
		await this.changed(id);
		return this.files.length === 1 ? this.file : this.files;
	}
}
