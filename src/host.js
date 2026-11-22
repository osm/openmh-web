'use strict';

const canvas = document.getElementById('canvas');
const raceView = new OpenMHRaceView(canvas);
const frontend = document.getElementById('frontend');
const picker = document.getElementById('picker');
const launcher = document.getElementById('launcher');
const launcherTabs = new OpenMHTabs(launcher.querySelector('[role="tablist"]'),
	// Keep game-tab links intact while the launcher waits for assets.
	{preserveUnknown: true});
const status = document.getElementById('status');
const error = document.getElementById('error');
const fullscreen = document.getElementById('fullscreen');
const retryStorage = document.getElementById('retry-storage');
const resume = document.getElementById('resume');
const bundledAssets =
	document.querySelector('meta[name="openmh-assets"]')?.content || '';
const launchArguments =
	document.querySelector('meta[name="openmh-unlock-all"]')?.content ===
		'1'
	? ['--unlock-all']
	: [];
let loading = false;
let downloading = false;
let lastError = '';
let session;
let initializing;
let mounted = false;
let gameRunning = false;
let player;
let raceSetup;
let webFrontend = false;

function suspensionChanged(state) {
	resume.hidden = !state.failed;
	if (!state.failed && !retryStorage.hidden)
		return;
	if (state.failed) {
		status.textContent = 'The game is waiting. Resume to retry.';
		error.textContent = lastError;
		error.hidden = false;
	} else if (state.paused) {
		status.textContent = state.reason === 'graphics'
			? 'Paused while graphics recover…'
			: state.reason === 'user'
			? 'Paused'
			: 'Paused while this page is hidden.';
		if (state.reason === 'user' && webFrontend) {
			const hint = document.createElement('span');
			hint.className = 'fullscreen-pause-hint';
			hint.textContent = 'Press P to resume.';
			status.append(hint);
		}
	} else {
		error.hidden = true;
		status.textContent = '';
	}
}

function reportStorageError(message) {
	status.textContent =
		'Saves could not be synchronized. The game is waiting.';
	error.textContent = message;
	error.hidden = false;
	retryStorage.hidden = false;
}

function gameExited(result) {
	raceView.close();
	gameRunning = false;
	resume.hidden = true;
	if (result)
		fail(lastError || 'The game reported an error.');
	else {
		showPicker();
		status.textContent = 'Game closed.';
	}
	fullscreen.hidden = true;
}

function runtime() {
	if (session)
		return Promise.resolve(session);
	if (initializing)
		return initializing;
	initializing =
		OpenMHSession
			.create({
				canvas,
				onSuspension: suspensionChanged,
				print: (text) => console.log(text),
				printErr: (text) => {
					lastError = String(text);
					console.error(text);
				},
				onAbort: (reason) => fail(String(reason)),
				onStorageError: reportStorageError,
				onGameExit: gameExited
			})
			.then((instance) => {
				session = instance;
				return session;
			})
			.catch((error) => {
				initializing = null;
				throw error;
			});
	return initializing;
}

const saveTools = new OpenMHSaveTools(
	runtime, resetBrowserData, () => contentUnavailable() || packages.busy);
const packages = new OpenMHPackages(
	(file) => loadPackage(file, false), chooseAnotherPackage);
const content = new OpenMHContent(packages, (value) => {
	if (!contentUnavailable())
		content.open(value, frontend.value);
}, () => contentUnavailable() || packages.busy);
packages.onChange = (id) => content.refresh(id);
packages.watchLibrary();
const importer = new OpenMHImporter(packages,
	(files, remember, target) =>
		loadPackage(files, remember, false, target),
	() => contentUnavailable() || packages.busy);
packages.unavailable = contentUnavailable;
let activeContent = '';

async function resetBrowserData(selected) {
	const saves = selected.filter((category) => category !== 'packages');
	// Initialize the runtime before deleting any selected collections.
	const game = saves.length ? await runtime() : null;
	let removedPackages = false;
	try {
		if (selected.includes('packages')) {
			await packages.clear();
			removedPackages = true;
		}
		if (saves.length)
			await game.resetData(saves);
	} catch (error) {
		throw new Error(
			(removedPackages
					? 'Added game files were removed. Save data could not be reset: '
					: '') +
			error.message);
	}
	const url = new URL(location.href);
	if (removedPackages) {
		url.searchParams.delete('choose-package');
		url.searchParams.set('content', 'builtin');
	}
	url.hash = 'settings';
	history.replaceState(null, '', url);
	saveTools.reload();
}

function contentUnavailable() {
	return loading || downloading || saveTools.busy ||
		!!raceSetup?.lobby.active() || !!raceView.dialog.open;
}

async function openLauncher() {
	const url = new URL(location.href);
	const original = url.searchParams.get('frontend') === 'original';
	if (original)
		frontend.value = 'original';
	const choosePackage = url.searchParams.has('choose-package');
	if (choosePackage) {
		url.searchParams.delete('choose-package');
		history.replaceState(null, '', url);
	}
	status.textContent = 'Checking for a remembered package…';
	await packages.ready;
	if (loading || !importer.form.hidden)
		return;
	if (!choosePackage && content.select.value === 'builtin') {
		await loadBundledPackage();
		return;
	}
	if (!choosePackage && packages.file &&
		(frontend.value === 'web' || original)) {
		await loadPackage(packages.files, false);
	} else {
		launcher.hidden = false;
		launcherTabs.restore();
		status.textContent = '';
	}
}

async function loadBundledPackage() {
	status.textContent = '';
	const progress = new OpenMHDownloadProgress(
		document.getElementById('asset-download'));
	downloading = true;
	try {
		const files = [];
		for (const [index, url] of bundledAssets.split(';').entries()) {
			const blob = await progress.download(url);
			files.push(
				new File([blob], 'package' + index + '.ass'));
		}
		downloading = false;
		await loadPackage(files, false, true);
	} catch (reason) {
		fail(reason.message + ' Reload this page to retry.');
	} finally {
		downloading = false;
	}
}

function chooseAnotherPackage() {
	if (contentUnavailable() || packages.busy)
		return;
	const url = new URL(location.href);
	url.searchParams.set('choose-package', '1');
	location.replace(url);
}

function fail(message) {
	raceView.close();
	gameRunning = false;
	if (mounted)
		session?.stop();
	showPicker();
	status.textContent = 'Unable to run this package.';
	error.textContent = message;
	error.hidden = false;
}

function showPicker() {
	document.getElementById('race-setup').hidden = true;
	document.getElementById('launcher-settings').append(saveTools.section);
	saveTools.section.hidden = false;
	launcher.hidden = false;
	launcherTabs.select('picker', false, 'replace');
}

async function mountPackage(files, remember, target) {
	session = await runtime();
	await session.mount(files);
	mounted = true;
	const remembered =
		remember ? await packages.remember(files, target) : true;
	if (activeContent !== 'builtin')
		packages.showCurrent(files, remembered);
	return remembered;
}

async function startWebFrontend() {
	player = await session.start({arguments: launchArguments});
	raceSetup = new OpenMHRaceSetup(player,
		canvas,
		() => saveTools.busy,
		JSON.parse(document.querySelector(
					   'meta[name="openmh-multiplayer"]')
				   ?.content ||
			'{}'),
		raceView);
	document.getElementById('settings-panel').append(saveTools.section);
	player.on('multiplayer', (view) => {
		saveTools.section.hidden =
			!['offline', 'failed'].includes(view.state);
	});
	player.on('started', () => {
		saveTools.section.hidden = true;
	});
	player.on('finished', () => {
		saveTools.section.hidden = raceSetup.lobby.active();
	});
	player.on('error', () => {
		saveTools.section.hidden = raceSetup.lobby.active();
	});
	saveTools.section.hidden = false;
}

async function loadPackage(
	selection, remember = true, builtin = false, target = null) {
	const files = Array.isArray(selection) ? selection
		: selection		       ? [selection]
					       : [];
	if (contentUnavailable() || packages.busy || !files.length)
		return;
	loading = true;
	try {
		if (remember)
			await OpenMHPackageStore.validatePackages(files);
		else
			OpenMHPackageStore.validateSelection(files);
	} catch (reason) {
		status.textContent = reason.message;
		packages.status.textContent = reason.message;
		return;
	} finally {
		loading = false;
	}
	if (mounted) {
		if (remember && !await packages.remember(files, target))
			return;
		content.open(builtin ? 'builtin' : packages.id, frontend.value);
		return;
	}
	activeContent = builtin ? 'builtin' : packages.id;
	content.select.value = activeContent;
	loading = true;
	webFrontend = frontend.value === 'web';
	error.textContent = lastError = '';
	error.hidden = true;
	picker.hidden = true;
	launcher.hidden = true;
	saveTools.section.hidden = true;
	const packageName = files.map((file) => file.name).join(' + ');
	status.textContent = bundledAssets ? 'Preparing game…'
					   : 'Loading ' + packageName + '…';
	try {
		const remembered = await mountPackage(files, remember, target);
		activeContent = builtin ? 'builtin'
			: remembered	? packages.id
					: null;
		if (!webFrontend)
			raceView.open();
		fullscreen.hidden = !raceView.supportsFullscreen();
		status.textContent = '';
		canvas.focus({preventScroll: true});
		gameRunning = true;
		if (webFrontend)
			await startWebFrontend();
		else
			await session.start({
				frontend: 'original',
				arguments: launchArguments
			});
	} catch (reason) {
		fail(reason instanceof Error ? reason.message : String(reason));
	} finally {
		loading = false;
	}
}

function bindPackageInput() {
	packages.bindInput((files, target) => {
		if (gameRunning &&
			files.some((file) => !/\.ass$/i.test(file.name))) {
			packages.status.textContent =
				'Open Game files to prepare a game download or disc image.';
			return;
		}
		importer.select(files, target);
	}, () => contentUnavailable() || packages.busy);
}

function guardSiteNavigation(event) {
	const link = event.target.closest('a[href]');
	if (!link || !raceSetup?.lobby.active())
		return;
	const url = new URL(link.href);
	if (url.origin === location.origin) {
		event.preventDefault();
		if (!raceSetup.navigationNotice.open)
			raceSetup.navigationNotice.showModal();
	}
}

function retrySaves() {
	if (!session.retrySaves())
		return;

	retryStorage.hidden = true;
	error.hidden = true;
	status.textContent = '';
}

function bindSessionActions() {
	canvas.addEventListener(
		'contextmenu', (event) => event.preventDefault());
	canvas.addEventListener('click', () => canvas.focus());
	fullscreen.addEventListener('click', () => raceView.toggleFullscreen());
	resume.addEventListener('click', () => session.resume());
	retryStorage.addEventListener('click', retrySaves);
}

document.addEventListener('click', guardSiteNavigation);
window.addEventListener('beforeunload', (event) => {
	if (raceSetup?.lobby.active() || raceView.dialog.open ||
		saveTools.busy || packages.busy) {
		event.preventDefault();
		event.returnValue = '';
	}
});
bindPackageInput();
bindSessionActions();
openLauncher();
