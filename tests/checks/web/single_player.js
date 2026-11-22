'use strict';

const configuration =
	'PlayerName Browser flow\nTeamName TEST\nGameType Single\n' +
	'CarName Kobra X3\nTrackName RedRock\nTrackLaps 1\n' +
	'CarTransmission Auto\nRecordRace On\nMenuConfirmation Off\n' +
	'SFXVolume 0\nMusicVolume 0\nRenderer Glide\nScreenDimension 640 480\n';

async function interruptMovie() {
	await waitFor(() => game.movie?.frames >= 3, 'opening movie frames');
	window.dispatchEvent(new PageTransitionEvent('pagehide'));
	const frames = game.movie.frames, interval = game.movie.interval;
	try {
		await sleep(900);
		check(game.movie.frames === frames,
			'page suspension freezes movie decoding');
	} finally {
		window.dispatchEvent(new PageTransitionEvent('pageshow'));
	}
	const start = performance.now();
	await sleep(250);
	const count = game.movie.frames - frames;
	const paced =
		Math.ceil(((performance.now() - start) * 1000) / interval) + 2;
	check(count > 0 && count <= paced,
		'movie resumes at its original cadence without catching up on hidden time');
}

async function startRace() {
	check(game.flow.network === 1,
		'multiplayer is disabled in the browser application');
	await press('ArrowRight');
	check(game.flow.selected === 2,
		'keyboard navigation skips multiplayer');
	await press('ArrowLeft');
	await press('Enter');
	await page('single');
	await press('ArrowRight');
	for (const name of ['setup', 'car', 'loading']) {
		await press('Enter');
		await page(name);
	}
	check(game.flow.milliseconds === 0,
		'loading confirmation holds the race clock');
	await press('Enter');
	await page('race');
	check(game.flow.cars === 8, 'single race starts with eight cars');
}

function keyEvent(type, key, number) {
	canvas.dispatchEvent(new KeyboardEvent(type, {
		key,
		code: key,
		keyCode: number,
		which: number,
		bubbles: true
	}));
}

function graphicsEvent(name, action) {
	return new Promise((resolve, reject) => {
		const done = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			canvas.removeEventListener(name, done);
			reject(new Error('Missing ' + name));
		}, 10000);
		canvas.addEventListener(name, done, {once: true});
		action();
	});
}

async function interrupt(stage, graphics) {
	const label = stage +
		(graphics ? ' graphics interruption' : ' page suspension');
	const gl = canvas.getContext('webgl2');
	const loss = graphics ? gl.getExtension('WEBGL_lose_context') : null;
	if (graphics && !loss)
		throw new Error('No WebGL loss extension');
	if (stage === 'race') {
		keyEvent('keydown', 'ArrowLeft', 37);
		await waitFor(() => game.flow.held > 0, 'held race key');
	}
	try {
		if (graphics)
			await graphicsEvent(
				'webglcontextlost', () => loss.loseContext());
		else
			window.dispatchEvent(
				new PageTransitionEvent('pagehide'));
		await waitFor(() => game.suspension?.suspended === 1,
			label + ' pause');
		const frozen = JSON.stringify(game.flow);
		const clock = game.suspension.ticks;
		// These queued shortcuts must not become fresh input on return.
		keyEvent('keydown', 'Escape', 27);
		keyEvent('keyup', 'Escape', 27);
		await sleep(700);
		check(JSON.stringify(game.flow) === frozen,
			label + ' freezes application progress');
		if (graphics) {
			// Simulate document visibility while exercising real graphics events.
			Object.defineProperty(document,
				'hidden',
				{value: true, configurable: true});
			document.dispatchEvent(new Event('visibilitychange'));
			await graphicsEvent('webglcontextrestored',
				() => loss.restoreContext());
			await sleep(250);
			check(game.suspension.suspended === 1 &&
					JSON.stringify(game.flow) === frozen,
				label + ' waits for visibility after graphics recover');
			delete document.hidden;
			document.dispatchEvent(new Event('visibilitychange'));
		} else
			window.dispatchEvent(
				new PageTransitionEvent('pageshow'));
		await waitFor(() => game.suspension?.suspended === 0,
			label + ' resume');
		check(game.suspension.ticks - clock < 50,
			label + ' excludes interruption and rebuild time from the game clock');
		await sleep(200);
		check(game.flow.stage === stage && !game.flow.paused &&
				!game.flow.held,
			label + ' clears stale input and resumes the same screen');
	} finally {
		if (graphics) {
			delete document.hidden;
			document.dispatchEvent(new Event('visibilitychange'));
		}
		keyEvent('keyup', 'ArrowLeft', 37);
		if (!graphics)
			window.dispatchEvent(
				new PageTransitionEvent('pageshow'));
	}
}

async function finishRace() {
	await waitFor(() => game.flow.stage === 'results',
		'finishing a real lap',
		210);
	check(game.flow.finished && game.flow.lap >= 1 &&
			game.flow.frames > 100,
		'AI driver completes a real lap through the rendered race loop');
	check(game.flow.milliseconds > 10000,
		'race completion uses simulated elapsed time');
	check(game.flow.commits === 0,
		'results wait for acceptance before committing');
	await game.flowCapture;
	await press('Enter');
}

async function saveRecording() {
	await page('recording');
	await waitFor(() => game.flow.modal, 'recording save prompt');
	await press('Enter');
	await waitFor(() => game.flow.recording === 5, 'recording name entry');
	for (const key of 'Browser')
		await press(key);
	await press('Enter');
	await page('main');
	check(game.flow.commits === 1,
		'accepted results commit exactly once and return to menus');
}

async function reloadSaves() {
	await waitFor(() => !game.storage.dirty && game.storage.status === 0,
		'synchronizing race saves');
	const files = await savedFiles();
	check(Object.keys(files).some((path) => /\.mde$/i.test(path)),
		'race recording is saved');
	check(Object.keys(files).some((path) => /redrock/i.test(path)),
		'completed race writes track records');
	sessionStorage.setItem('flow-reload', JSON.stringify(files));
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
}

async function run() {
	const expected = sessionStorage.getItem('flow-reload');
	await loadFixtureGame(
		expected ? null : configuration, ['--unlock-all']);
	if (!expected)
		await interruptMovie();
	await openFixtureMenu();
	if (!expected) {
		await interrupt('main', true);
		await interrupt('main', false);
		await startRace();
		await interrupt('race', false);
		await interrupt('race', true);
		await finishRace();
		await saveRecording();
		return reloadSaves();
	}
	const files = await savedFiles();
	check(JSON.stringify(files) === expected,
		'race saves restore byte-for-byte after page reload');
	check(game.flow.commits === 0,
		'reloaded application has a fresh session');
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({passed: true, checks, files})
	});
}

run().catch(async (reason) => {
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({
			passed: false,
			checks,
			error: reason.stack || String(reason),
			state: game?.flow
		})
	});
});
