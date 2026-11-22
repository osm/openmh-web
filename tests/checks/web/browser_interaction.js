'use strict';

const diagnostics = [];
window.addEventListener('error',
	(event) =>
		diagnostics.push(String(event.error?.stack || event.message)));
window.addEventListener('unhandledrejection',
	(event) =>
		diagnostics.push(String(event.reason?.stack || event.reason)));

let pointer;
document.addEventListener('mousemove', (event) => {
	pointer = {
		x: event.screenX - event.clientX,
		y: event.screenY - event.clientY,
		trusted: event.isTrusted
	};
});
const trusted = {
	keys: 0,
	clicks: 0,
	files: 0,
	cancelled: 0
};
document.addEventListener('keydown', (event) => {
	if (event.isTrusted)
		trusted.keys++;
});
document.addEventListener('click', (event) => {
	if (event.isTrusted)
		trusted.clicks++;
});
document.getElementById('assets').addEventListener('change', (event) => {
	if (event.isTrusted)
		trusted.files++;
});
document.getElementById('assets').addEventListener(
	'cancel', () => trusted.cancelled++);

async function input(action) {
	const response = await fetch(
		'/input', {method: 'POST', body: JSON.stringify(action)});
	const result = await response.json();
	if (!result.ok)
		throw new Error(result.error);
	await sleep(200);
}

async function click(element, relativeX = 0.5, relativeY = 0.5) {
	element.scrollIntoView({block: 'center'});
	const rectangle = element.getBoundingClientRect();
	await input({
		kind: 'click',
		x: Math.round(
			pointer.x + rectangle.x + rectangle.width * relativeX),
		y: Math.round(
			pointer.y + rectangle.y + rectangle.height * relativeY)
	});
}

async function key(name) {
	await input({kind: 'key', key: name});
}

async function raceInputReady() {
	const frames = game.flow.frames;
	// Focus recovery resets the shared keyboard's four startup polls.
	await waitFor(() => game.flow.frames >= frames + 6,
		'race input startup polls');
}

async function openGame() {
	await input({kind: 'focus'});
	await input({kind: 'move', x: 101, y: 201});
	await input({kind: 'move', x: 100, y: 200});
	await waitFor(() => pointer, 'trusted pointer calibration');
	check(pointer.trusted,
		'pointer calibration uses trusted browser events');
	game = (await runtime()).engine;
	await game.storage.prepare();
	game.flowManualDrive = true;
	const music = sessionStorage.getItem('interaction-drop') ? 80 : 0;
	game.FS.writeFile('/userdata/motorhead.cfg',
		'PlayerName Browser input\nGameType Single\nCarName Kobra X3\n' +
			'TrackName RedRock\nTrackLaps 1\nMenuConfirmation Off\nRecordRace Off\n' +
			'SFXVolume ' + (music ? 0 : 80) + '\nMusicVolume ' +
			music + '\nRenderer Glide\nScreenDimension 640 480\n');
	if (sessionStorage.getItem('interaction-drop')) {
		const bytes = await (await fetch('/game.ass')).arrayBuffer();
		const transfer = new DataTransfer();
		transfer.items.add(new File([bytes], 'dropped.ass'));
		document.dispatchEvent(new DragEvent('drop', {
			dataTransfer: transfer,
			bubbles: true,
			cancelable: true
		}));
	} else {
		await click(document.getElementById('assets'), 0.1);
		await sleep(500);
		await input({kind: 'file'});
	}
	await waitFor(() => game.movie?.frames >= 3,
		'movie after file selection',
		40);
	check(sessionStorage.getItem('interaction-drop')
			? packages.file?.name === 'dropped.ass'
			: trusted.files === 1,
		sessionStorage.getItem('interaction-drop')
			? 'drop handler loads a File payload and starts its movie'
			: 'native file picker loads the selected asset package');
	for (let attempt = 0; !game.flow && attempt < 15; attempt++) {
		await key('Escape');
		await sleep(400);
	}
	await page('main');
	canvas.focus();
	await key('Right');
	await key('Left');
	await waitFor(() => audioProbe.contexts.some(
			      (context) => context.state === 'running'),
		'audio after a real browser gesture');
	await waitFor(() => audioProbe.peak > 0.001, 'non-silent game audio');
	check(audioProbe.peak > 0.001,
		'game audio produces non-silent output under default autoplay policy');
}

async function fullscreenRoundTrip(stage) {
	await click(fullscreen);
	await waitFor(() => document.fullscreenElement?.contains(canvas),
		'fullscreen entry');
	const rectangle = canvas.getBoundingClientRect();
	check(rectangle.width === innerWidth &&
			rectangle.height === innerHeight,
		stage + ' fullscreen canvas fills the browser viewport');
	await input({kind: 'capture', name: 'fullscreen_' + stage});
	await key('Escape');
	await waitFor(() => !document.fullscreenElement, 'fullscreen exit');
	await input({kind: 'move', x: 100, y: 200});
	await page(stage);
	if (stage === 'race')
		await raceInputReady();
	check(gameRunning,
		'exiting ' + stage + ' fullscreen keeps the game running');
}

async function multiplayer() {
	check(game.flow.network === 1,
		'multiplayer is disabled in the loaded menu');
	canvas.focus();
	await key('Right');
	check(game.flow.selected === 2,
		'trusted keyboard navigation skips multiplayer');
	await key('Left');
	check(game.flow.selected === 0,
		'reverse keyboard navigation also skips multiplayer');
	await input({kind: 'capture', name: 'menu'});
	// Patched retail's multiplayer label is centered near (144, 170) in 640x400.
	const rectangle = canvas.getBoundingClientRect();
	const scale = Math.min(rectangle.width / 640, rectangle.height / 400);
	await input({
		kind: 'click',
		x: Math.round(pointer.x + rectangle.x +
			(rectangle.width - 640 * scale) / 2 + 144 * scale),
		y: Math.round(pointer.y + rectangle.y +
			(rectangle.height - 400 * scale) / 2 + 170 * scale)
	});
	// Original menus map a mouse click to Enter on the current enabled item.
	await page('single');
	check(game.flow.network === 1,
		'clicking the multiplayer label cannot activate multiplayer');
	await key('Escape');
	await page('main');
}

async function switchTabs() {
	const events = [];
	const visibility = (event) => events.push(
		{trusted: event.isTrusted, hidden: document.hidden});
	document.addEventListener('visibilitychange', visibility);
	let frozen;
	try {
		await key('Control_L+t');
		await waitFor(
			() => document.hidden && game.suspension?.suspended,
			'background tab suspension');
		frozen = JSON.stringify(game.flow);
		await sleep(1500);
		check(JSON.stringify(game.flow) === frozen,
			'a real background tab freezes race ticks, positions and rendered frames');
	} finally {
		if (document.hidden)
			await key('Control_L+w');
		document.removeEventListener('visibilitychange', visibility);
	}
	await waitFor(() => !document.hidden && !game.suspension.suspended,
		'foreground tab resume');
	check(events.some((event) => event.trusted && event.hidden) &&
			events.some((event) => event.trusted && !event.hidden),
		'tab switching delivers trusted hidden and visible events');
	const before = JSON.parse(frozen);
	await waitFor(() => game.flow.frames > before.frames,
		'foreground race frame');
	check(game.flow.paused,
		'focus loss retains the shared race pause after returning to the tab');
	await click(canvas);
	await raceInputReady();
	// Native focus loss pauses too; choose Continue in its ordinary pause menu.
	await key('Escape');
	await key('Return');
	await waitFor(() => game.flow.milliseconds > before.milliseconds,
		'resumed race ticks');
	check(game.flow.milliseconds - before.milliseconds < 1000,
		'returning to the game resumes without simulating time spent in another tab');
	canvas.focus();
}

async function driveAndAbort() {
	await key('Return');
	await page('single');
	await key('Right');
	for (const stage of ['setup', 'car', 'loading']) {
		await key('Return');
		await page(stage);
	}
	await key('Return');
	await page('race');
	await click(canvas);
	await raceInputReady();
	audioProbe.peak = 0;
	await waitFor(
		() => game.flow.milliseconds > 1000, 'race countdown finishes');
	const start = {x: game.flow.x, z: game.flow.z};
	await input({kind: 'key', key: 'Up', seconds: 3});
	check(game.inputProbe.throttle > 0.5 &&
			Math.hypot(game.flow.x - start.x,
				game.flow.z - start.z) > 1,
		'trusted accelerator input moves the player car without the fixture AI');
	check(audioProbe.peak > 0.001,
		'race sound effects produce output while music is muted');
	await input({kind: 'key', key: 'Left', seconds: 2});
	check(game.inputProbe.steering > 0.05,
		'trusted steering input reaches the simulation controls');
	const mouse = game.inputProbe.mouse;
	const rectangle = canvas.getBoundingClientRect();
	for (const delta of [-40, 40])
		await input({
			kind: 'move',
			x: Math.round(pointer.x + rectangle.x +
				rectangle.width / 2 + delta),
			y: Math.round(
				pointer.y + rectangle.y + rectangle.height / 2)
		});
	check(game.inputProbe.mouse > mouse,
		'real mouse motion reaches the race input provider');
	await switchTabs();
	await fullscreenRoundTrip('race');
	await input({kind: 'capture', name: 'race'});
	await key('Escape');
	await waitFor(() => game.flow.paused, 'race pause menu');
	await key('Up');
	await key('Return');
	await page('main');
	check(game.flow.commits === 1,
		'quit-to-menu completes the normal aborted-race return path');
}

async function run() {
	await openGame();
	if (!sessionStorage.getItem('interaction-drop')) {
		await fullscreenRoundTrip('main');
		await multiplayer();
		await driveAndAbort();
		check(trusted.keys > 0 && trusted.clicks > 0,
			'menu and fullscreen checks used real keyboard and mouse input');
		sessionStorage.setItem(
			'interaction-picker-input', JSON.stringify(trusted));
		sessionStorage.setItem('interaction-drop', '1');
		sessionStorage.setItem('flow-checks', JSON.stringify(checks));
		location.reload();
		return;
	}
	audioProbe.peak = 0;
	await waitFor(
		() => audioProbe.peak > 0.001, 'menu music with muted effects');
	check(audioProbe.peak > 0.001,
		'menu music produces output while sound effects are muted');
	check(trusted.keys > 0, 'dropped game accepts real keyboard input');
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({
			passed: true,
			checks,
			trusted: {
				picker: JSON.parse(sessionStorage.getItem(
					'interaction-picker-input')),
				drop: trusted
			},
			audioPeak: audioProbe.peak
		})
	});
}

run().catch(async (reason) => {
	await input({kind: 'capture', name: 'failure'});
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({
			passed: false,
			checks,
			error: String(reason) + '\n' + (reason.stack || ''),
			state: game?.flow,
			trusted,
			pointer,
			diagnostics,
			input: game?.inputProbe,
			activeElement: document.activeElement?.id,
			audioPeak: audioProbe.peak,
			audioStates: audioProbe.contexts.map(
				(context) => context.state),
			audioResume: audioProbe.resumes.slice(-10),
			activation: {
				active: navigator.userActivation.isActive,
				seen: navigator.userActivation.hasBeenActive
			}
		})
	});
});
