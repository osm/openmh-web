'use strict';

const checks = JSON.parse(sessionStorage.getItem('package-checks') || '[]');
const first = new File([new Uint8Array([0, 128, 255, 13, 10])], 'first.ass');
const second = new File([new Uint8Array([3, 2, 1])], 'second.ASS');
let calls = 0;

function check(value, message) {
	if (!value)
		throw new Error(message);
	checks.push(message);
}

async function waitFor(predicate) {
	const deadline = performance.now() + 10000;
	while (!predicate()) {
		if (!error.hidden)
			throw new Error(error.textContent);
		if (performance.now() > deadline)
			throw new Error('Package operation timed out.');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function expectReload(stage) {
	sessionStorage.setItem('package-next-stage', stage);
	sessionStorage.setItem('package-checks', JSON.stringify(checks));
}

function reload(stage) {
	game.storage.close();
	sessionStorage.setItem('package-checks', JSON.stringify(checks));
	location.search = '?' + stage;
}

async function played(file) {
	await waitFor(() => calls === 1);
	check(String(game.FS.readFile('/assets/package0.ass')) ===
			String(new Uint8Array(await file.arrayBuffer())),
		'play loads exact bytes: ' + file.name);
	check(picker.hidden && !canvas.hidden, 'play opens the game canvas');
	lifecycle.stop();
	checkpoints.stop();
	raceView.close();
}

function select(file, drop = false) {
	const transfer = new DataTransfer();
	transfer.items.add(file);
	if (drop) {
		document.dispatchEvent(new DragEvent(
			'drop', {dataTransfer: transfer, bubbles: true}));
	} else {
		const input = document.getElementById('assets');
		input.files = transfer.files;
		input.dispatchEvent(new Event('change'));
	}
}

async function abortedReplacement() {
	const database = packages.database;
	const open = database.open.bind(database);
	database.open = async () => {
		const db = await open();
		const transaction = db.transaction.bind(db);
		db.transaction = (...args) => {
			const pending = transaction(...args);
			if (args[1] === 'readwrite')
				queueMicrotask(() => pending.abort());
			return pending;
		};
		return db;
	};
	const preferred = content.preferred();
	select(first);
	await played(first);
	check(activeContent === null && content.preferred() === preferred,
		'failed storage keeps the previous content preference without identifying the unsaved game as a stored package');
	check(packages.status.textContent.includes('without remembering'),
		'interrupted package write warns but still plays the selected file');
	check(packages.forgetCurrentButton.hidden,
		'an unstored current package cannot accidentally forget the previous package');
	database.open = open;
	check((await database.read(packages.id)).files[0].name === second.name,
		'interrupted replacement preserves the previous remembered package');
}

async function forgetPackage() {
	const remove = packages.database.remove.bind(packages.database);
	packages.database.remove = async () => {
		throw new Error('Injected storage failure');
	};
	packages.forgetButton.click();
	await waitFor(() => !packages.busy);
	check(!packages.section.hidden && !packages.forgetButton.disabled &&
			packages.status.textContent.includes(
				'Could not forget'),
		'failed removal can be retried');
	packages.database.remove = remove;
	expectReload('?forgot-picker');
	packages.forgetButton.click();
}

async function checkForgottenPackage() {
	check(!launcher.hidden && !picker.hidden && canvas.hidden && !loading,
		'forget returns directly to the package picker');
	check(packages.section.hidden &&
			(await packages.database.list()).length === 0,
		'forget removes the package');
	await game.storage.prepare();
	check(String(game.FS.readFile('/userdata/marker')) === '42',
		'forget keeps game saves');
	const snapshot = await game.storage.database.read();
	const backup =
		await OpenMHBackup.decode(await OpenMHBackup.encode(snapshot));
	check(backup.entries.length === 1 &&
			backup.entries[0].path === 'marker',
		'save backups contain no remembered assets');
}

async function unavailableStorage() {
	// A browser may deny storage entirely; selection and playback still work.
	OpenMHPackageDatabase.prototype.open = async () => {
		throw new DOMException(
			'Storage unavailable', 'QuotaExceededError');
	};
	const unavailable = new OpenMHPackages(() => {});
	await unavailable.ready;
	check(unavailable.status.textContent.includes('Choose a file'),
		'unavailable storage leaves file selection usable');
	const preferred = content.preferred();
	select(first);
	await played(first);
	check(activeContent === null && content.preferred() === preferred,
		'failed storage keeps the previous content preference without identifying the unsaved game as a stored package');
	check(packages.status.textContent.includes('without remembering'),
		'quota or storage denial does not prevent playback');
}

async function run() {
	OpenMHPackageDatabase.validate = async files => {
		if (files.some(file => !file.size))
			throw new Error('Invalid test package.');
	};
	await packages.ready;
	check(getComputedStyle(document.body).backgroundColor ===
				'rgb(4, 4, 32)' &&
			document.querySelector('link[rel="stylesheet"]').sheet,
		'page loads the shared stylesheet across reloads');
	await runtime();
	game.callMain = (args) => {
		check(args.includes('/assets'),
			'host starts the mounted asset package');
		calls++;
	};
	const stage =
		sessionStorage.getItem('package-next-stage') || location.search;
	sessionStorage.removeItem('package-next-stage');
	switch (stage) {
	case '':
		check(packages.section.hidden,
			'first visit has no remembered package');
		await loadPackage(new File(['x'], 'invalid.zip'));
		check(!loading && !calls,
			'non-package selection leaves the picker usable');
		await loadPackage(new File([], 'invalid.ass'));
		check(!mounted && !calls &&
				!(await packages.database.list()).length &&
				packages.status.textContent ===
					'Invalid test package.',
			'Play rejects invalid contents before mounting or remembering');
		await game.storage.prepare();
		game.FS.writeFile('/userdata/marker', new Uint8Array([42]));
		game.storage.begin(false);
		await game.storage.operation;
		select(first);
		await played(first);
		check((await packages.database.read(packages.id))
					.files[0]
					.name === first.name,
			'file selection remembers a package');
		reload('play');
		return;
	case '?play':
		check(!packages.section.hidden &&
				packages.list.querySelector('li > span')
						?.textContent === first.name,
			'full page reload offers the remembered package');
		packages.database.writeCollection = async () => {
			throw new Error('Play must not rewrite assets');
		};
		packages.playButton.click();
		await played(first);
		check(!packages.status.textContent.includes(
			      'without remembering'),
			'Play reuses storage without rewriting it');
		check(!packages.forgetCurrentButton.hidden &&
				packages.forgetCurrentButton.textContent ===
					'Forget ' + first.name,
			'current package action identifies the remembered asset file');
		expectReload('?forgot-current');
		packages.forgetCurrentButton.click();
		return;
	case '?forgot-current':
		await checkForgottenPackage();
		// Restore the fixture for the following replacement scenarios.
		await packages.remember(first);
		content.select.value = packages.id;
		content.setDefault();
		reload('replace');
		return;
	case '?replace':
		select(second, true);
		await played(second);
		check((await packages.database.read(packages.id))
						.files[0]
						.name === second.name &&
				packages.library.length === 2,
			'dropping another package selects it and preserves the first game');
		const earlier = packages.library.find(
			(record) => record.id !== packages.id);
		await packages.database.remove(earlier.id);
		reload('abort');
		return;
	case '?abort':
		check(packages.list.querySelector('li > span')?.textContent ===
				second.name,
			'replacement survives page reload');
		await abortedReplacement();
		reload('forget');
		return;
	case '?forget':
		await forgetPackage();
		return;
	case '?forgot-picker':
		await checkForgottenPackage();
		reload('collection');
		return;
	case '?collection': {
		await packages.remember([first, second]);
		content.select.value = packages.id;
		content.setDefault();
		const stored = await packages.database.read(packages.id);
		check(stored.files.length === 2,
			'multiple packages are committed together');
		reload('collection-restored');
		return;
	}
	case '?collection-restored': {
		check(packages.files.length === 2,
			'the entire game collection survives reload');
		check(packages.files[1].name === second.name,
			'overlay filename survives reload');
		check(document.querySelectorAll('#package-files a[download]')
					.length === 2,
			'each package has its own download');
		await packages.removeFile(second.name);
		check(packages.files.length === 1 &&
				packages.file.name === first.name,
			'removing an overlay preserves the base');
		const before = await packages.database.read(packages.id);
		const transaction =
			packages.database.transaction.bind(packages.database);
		packages.database.transaction = async (mode, operation) => {
			if (mode === 'readwrite')
				throw new Error('Injected collection failure');
			return transaction(mode, operation);
		};
		check(!(await packages.remember([second, first])),
			'failed collection replacement is reported');
		packages.database.transaction = transaction;
		check((await packages.database.read(packages.id))
					.files[0]
					.name === before.files[0].name,
			'failed collection replacement preserves the previous game');
		await packages.database.remove(packages.id);
		reload('unavailable');
		return;
	}
	case '?unavailable':
		check(packages.section.hidden,
			'forgotten package stays absent after reload');
		await unavailableStorage();
		break;
	default:
		throw new Error('Unexpected test phase');
	}
	game.storage.close();
	await fetch('/report',
		{method: 'POST', body: JSON.stringify({passed: true, checks})});
}

run().catch((reason) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify(
		{passed: false, checks, error: reason.stack || String(reason)})
}));
