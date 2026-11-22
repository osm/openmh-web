'use strict';

const diagnostics = captureFlowErrors();

const configuration =
	'PlayerName Browser trial\nGameType TimeAttack\nCarName Kobra X3\n' +
	'TrackName RedRock\nTrackLaps 1\nCarTransmission Auto\n' +
	'RecordRace On\nMenuConfirmation Off\nSFXVolume 0\nMusicVolume 0\n' +
	'Renderer Glide\nScreenDimension 640 480\n';

async function selectSingle(choice) {
	await press('Enter');
	await page('single');
	for (let attempt = 0; game.choices.single !== choice && attempt < 5;
		attempt++)
		await press('ArrowRight');
	check(game.choices.single === choice,
		'single-player menu selects choice ' + choice);
	await press('Enter');
}

async function beginRace(mode, cars, remote) {
	await page('loading');
	check(game.flow.milliseconds === 0,
		'mode ' + mode + ' waits on loading confirmation');
	check(game.raceSetup.mode === mode &&
			game.raceSetup.remote === remote &&
			game.raceSetup.laps === 1,
		'mode ' + mode + ' configures its real race controller');
	await press('Enter');
	await page('race');
	check(game.flow.cars === cars,
		'mode ' + mode +
			' starts with the expected car count: ' + cars);
}

async function finishRace(destination, mode) {
	await waitFor(() => game.flow.stage === destination,
		'mode ' + mode + ' completes its lap',
		210);
	check(game.lastRace.finished && game.lastRace.lap >= 1 &&
			game.lastRace.frames > 100 &&
			game.lastRace.milliseconds > 10000,
		'mode ' + mode + ' finishes a real lap before returning');
	check(game.flow.commits > 0,
		'mode ' + mode +
			' commits results without the ordinary results board');
}

async function saveRecording(name) {
	await page('recording');
	await waitFor(() => game.flow.modal, 'recording save prompt');
	await press('Enter');
	await waitFor(() => game.flow.recording === 5, 'recording name entry');
	for (const key of name)
		await press(key);
	await press('Enter');
	await page('main');
}

async function stableFiles() {
	await waitFor(() => !game.storage.dirty && game.storage.status === 0,
		'recording persistence');
	return savedFiles();
}

async function reload(phase) {
	sessionStorage.setItem(
		'recording-files', JSON.stringify(await stableFiles()));
	sessionStorage.setItem('recording-phase', phase);
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
}

async function timeAttack() {
	await selectSingle(3);
	for (const stage of ['setup', 'car']) {
		await page(stage);
		await press('Enter');
	}
	await beginRace(2, 1, 0);
	await finishRace('recording', 2);
	sessionStorage.setItem(
		'trial-time', String(game.lastRace.milliseconds));
	await saveRecording('TimeTrial');
	const files = await stableFiles();
	const path = Object.keys(files).find(
		(name) => /timetrial.*\.mde$/i.test(name));
	check(!!path, 'time attack saves its named recording');
	check(Object.keys(files).some((name) => /redrock/i.test(name)),
		'time attack writes track records');
	sessionStorage.setItem('trial-path', path);
	sessionStorage.setItem('trial-hash', files[path]);
	await reload('playback');
}

async function chooseRecording(watch) {
	await selectSingle(4);
	await page('ghost');
	// Original Ghost page starts on the Ghostmode row; Down selects Demo.
	if (watch)
		await press('ArrowDown');
	await press('ArrowRight');
	for (let attempt = 0;
		game.choices.selected > 0 && attempt < game.choices.count;
		attempt++)
		await press('ArrowUp');
	for (let attempt = 0; !/timetrial/i.test(game.choices.name) &&
		attempt < game.choices.count;
		attempt++)
		await press('ArrowDown');
	check(/timetrial/i.test(game.choices.name),
		'recording catalog selects the saved time attack');
	check(game.choices.mode === (watch ? 6 : 3),
		'recording menu retains the requested playback mode');
	await press('Enter');
	if (!watch) {
		await page('car');
		await press('Enter');
	}
	await beginRace(watch ? 6 : 3, watch ? 1 : 2, watch ? 1 : 0);
}

async function raceAndWatch() {
	await chooseRecording(false);
	await finishRace('recording', 3);
	await saveRecording('GhostTrial');
	await chooseRecording(true);
	await finishRace('main', 6);
	check(Math.abs(game.lastRace.milliseconds -
		      Number(sessionStorage.getItem('trial-time'))) < 1000,
		'watching the recording reproduces its finish time');
	const files = await stableFiles();
	check(files[sessionStorage.getItem('trial-path')] ===
			sessionStorage.getItem('trial-hash'),
		'watching and ghost racing preserve the source recording');
	check(Object.keys(files).some(
		      (name) => /ghosttrial.*\.mde$/i.test(name)),
		'ghost race saves a separate recording');
	await reload('complete');
}

async function run() {
	const phase = sessionStorage.getItem('recording-phase');
	await loadFixtureGame(phase ? null : configuration, ['--unlock-all']);
	await openFixtureMenu();
	if (!phase)
		return timeAttack();
	check(JSON.stringify(await savedFiles()) ===
			sessionStorage.getItem('recording-files'),
		'recordings and track records restore byte-for-byte after reload: ' +
			phase);
	if (phase === 'playback')
		return raceAndWatch();
	await fetch('/report',
		{method: 'POST', body: JSON.stringify({passed: true, checks})});
}

run().catch(async (reason) => {
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({
			passed: false,
			checks,
			error: String(reason) + '\n' + (reason.stack || ''),
			state: game?.flow,
			choices: game?.choices,
			setup: game?.raceSetup,
			lastRace: game?.lastRace,
			diagnostic: lastError,
			diagnostics
		})
	});
});
