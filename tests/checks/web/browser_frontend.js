'use strict';

async function rejects(operation, message) {
	let rejected = false;
	try {
		await operation();
	} catch {
		rejected = true;
	}
	check(rejected, message);
}

async function openFrontend() {
	game = (await runtime()).engine;
	const main = game.callMain;
	game.callMain = (args) => {
		args[args.indexOf('--audio') + 1] = '0';
		args.push('--unlock-all');
		return main(args);
	};
	if (location.search !== '?reload') {
		await game.storage.prepare();
		game.FS.writeFile('/userdata/motorhead.cfg',
			'RecordRace On\nRenderer OpenMH\nTeamName OLD\nPlayerColour 18 52 86\nControlName Joystick\n');
		game.FS.writeFile('/userdata/keyboard.clo',
			'LayoutName Keyboard\nHorn H\nShiftGearUp S\nShiftGearDown A\n');
	}
	if (location.search === '?reload') {
		await waitFor(() => raceSetup,
			'restore remembered package into web setup',
			45);
		check(launcher.hidden && player.state === 'ready',
			'reload opens remembered assets directly into race setup without starting a race');
	} else {
		const blob = await (await fetch('/game.ass')).blob();
		await loadPackage(new File([blob], 'retail.ass'));
	}
	check(!!raceSetup && player.state === 'ready',
		'package opens the web form without original menus');
	check(!game.movie && !game.flow,
		'no opening movie or original menu was run');
	check(raceSetup.renderer.name === 'OpenMH',
		'page selects OpenMH without exposing a renderer selector');
	check(!raceSetup.input('controls'),
		'page has no control-profile selector');
	if (location.search !== '?reload') {
		check(raceSetup.input('team').value === 'OLD',
			'team field restores saved settings');
		check(raceSetup.input('resolution').value === '1280x1024',
			'web setup defaults to 1280x1024 when no resolution is saved');
		const content = player.getContent();
		check(content.nameColors.length === 32 &&
				content.nameColors[0] === 0xdcdcdc &&
				content.nameColors[31] === 0x38291d,
			'name palette comes from the original personal menu');
		check(player.getSettings().player.color === 0x123456 &&
				Number(raceSetup.input('nameColor').value) ===
					0x123456 &&
				raceSetup.configuration().player.color ===
					0x123456,
			'opening the form preserves a saved color outside the palette');
		check(raceSetup.input('nameColor')
				.selectedOptions[0]
				.text.includes('#123456'),
			'custom saved color remains identifiable in the dropdown');
		raceSetup.input('nameColor').value = 0xdc180a;
		raceSetup.input('nameColor').dispatchEvent(new Event('change'));
		check(getComputedStyle(
			      document.getElementById('name-color-swatch'))
					.backgroundColor === 'rgb(220, 24, 10)',
			'color selection updates the preview swatch');

		check([...raceSetup.input('audioProfile').options]
					.map((item) => Number(item.value))
					.join(',') ===
				content.audioProfiles
					.filter((item) => item.available)
					.map((item) => item.id)
					.join(','),
			'audio selector contains exactly the included profiles');
		check(content.controls.find((item) => item.id ===
						      player.getSettings()
							      .controls)
					?.name ===
				(content.controls.some(
					 (item) => item.name === 'Joystick')
						? 'Joystick'
						: 'Keyboard'),
			'saved controls retain an included profile or fall back to Keyboard');
		check(content.controls.find((item) => item.id ===
						      raceSetup.configuration()
							      .controls)
					?.name === 'Keyboard',
			'page chooses Keyboard even when saved controls use a joystick');
	}
}

async function exerciseValidation() {
	const before = JSON.stringify(game.storage.snapshot());
	for (const config of [{track: 999},
		     {car: 0},
		     {laps: 0},
		     {laps: 4294967296},
		     {player: {name: 'too long a player name'}},
		     {player: {team: 'ABCDE'}},
		     {player: {team: 'A\nB'}},
		     {player: {team: 123}},
		     {player: {color: -1}},
		     {player: {color: 0x1000000}},
		     {player: {color: 1.5}},
		     {player: {color: '#ff0000'}},
		     {mode: 1},
		     {sound: {musicTrack: 1}},
		     {sound: {musicTrack: 999}},
		     {horn: 999},
		     {horn: -1},
		     {horn: 0.5},
		     {graphics: {width: 1}},
		     {graphics: {renderer: 'missing'}},
		     {sound: {musicVolume: 101}},
		     {unknown: 1}])
		await rejects(() => player.startRace(config),
			'invalid launch rejected: ' + JSON.stringify(config));
	player.require(game._mh_browser_race_reset());
	check(!player.call('set',
		      'number',
		      ['string', 'number'],
		      ['player_color', 0x1000000]),
		'native API rejects colors outside 24-bit RGB');
	check(!player.call('set_team', 'number', ['string'], ['ABCDE']),
		'native API rejects an oversized team');
	player.require(player.call('set_team', 'number', ['string'], ['A\nB']));
	check(!game._mh_browser_race_start(),
		'native race validation rejects nonprintable team text');
	player.require(game._mh_browser_race_reset());
	check(JSON.stringify(game.storage.snapshot()) === before,
		'rejected requests preserve saved settings');
	check(player.state === 'ready',
		'rejected launch leaves the form ready');
}

function exerciseTabs() {
	const race = document.getElementById('race-panel');
	const settings = document.getElementById('settings-panel');
	const raceTab = document.getElementById('single-player-tab');
	const settingsTab = document.getElementById('settings-tab');
	check(!race.hidden && settings.hidden, 'package opens the Race tab');
	check(settings.contains(saveTools.section) &&
			!settings.contains(content.select),
		'Settings contains save tools and leaves game selection in the picker');
	settingsTab.click();
	check(race.hidden && !settings.hidden &&
			settingsTab.getAttribute('aria-selected') === 'true',
		'Settings tab reveals preferences and hides race configuration');
	const team = raceSetup.input('team').value;
	raceSetup.input('team').value = 'TABS';
	raceTab.click();
	check(!race.hidden && settings.hidden &&
			raceSetup.configuration().player.team === 'TABS',
		'returning to Race keeps edited settings');
	raceTab.dispatchEvent(new KeyboardEvent(
		'keydown', {key: 'ArrowLeft', bubbles: true}));
	check(document.activeElement === settingsTab && !settings.hidden &&
			raceTab.tabIndex === -1,
		'arrow navigation moves tab focus and selection');
	settingsTab.dispatchEvent(
		new KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
	check(document.activeElement === raceTab && !race.hidden &&
			settingsTab.tabIndex === -1,
		'Home returns keyboard focus to the Race tab');
	raceTab.dispatchEvent(
		new KeyboardEvent('keydown', {key: 'End', bubbles: true}));
	check(document.activeElement === settingsTab,
		'Settings is the last tab');
	settingsTab.dispatchEvent(new KeyboardEvent(
		'keydown', {key: 'ArrowLeft', bubbles: true}));
	check(document.activeElement ===
			document.getElementById('multiplayer-tab'),
		'Multiplayer sits between Single player and Settings');
	raceTab.click();
	document.getElementById('results-tab').click();
	check(!document.getElementById('single-player-panel').hidden &&
			!document.getElementById('results-panel').hidden &&
			!document.getElementById('results-empty').hidden,
		'Single player contains results with an empty state before the first race');
	document.getElementById('race-tab').click();
	raceSetup.input('team').value = team;
}

function exerciseHiddenValidation() {
	const name = raceSetup.input('name');
	const saved = name.value;
	raceSetup.selectTab('settings-panel');
	name.value = '';
	raceSetup.form.requestSubmit();
	check(!document.getElementById('race-panel').hidden &&
			document.activeElement === name &&
			player.state === 'ready',
		'invalid hidden driver name opens Race and receives focus');
	name.value = saved;
	raceSetup.selectTab('settings-panel');
	raceSetup.form.requestSubmit();
	check(!document.getElementById('race-panel').hidden &&
			player.state === 'ready',
		'submitting Settings returns to Race without starting it');
	const laps = raceSetup.input('laps');
	const savedLaps = laps.value;
	laps.value = '0';
	name.value = '';
	raceSetup.form.requestSubmit();
	check(!document.getElementById('race-panel').hidden &&
			document.activeElement === name,
		'multiple errors keep the first invalid field visible');
	laps.value = savedLaps;
	name.value = saved;
}

function checkSortedChoices(field, entries) {
	const options = [...raceSetup.input(field).options];
	const names = options.map((option) => option.text.toLowerCase());
	check(names.every((name, i) => i === 0 || names[i - 1] <= name),
		field + ' choices are alphabetical');
	const available = entries.filter((entry) => entry.available);
	check(options.length === available.length &&
			options.every(
				(option) => available.some(
					(entry) => entry.id ===
							Number(option.value) &&
						entry.name === option.text)),
		field + ' sorting preserves installed IDs and available choices');
}

async function exerciseSelector() {
	const content = player.getContent();
	const keys = player.getControlBindings(raceSetup.keyboard.id);
	check(keys.horn === 'H' && keys.shiftUp === 'S' &&
			keys.shiftDown === 'A' && keys.handbrake === 'Space' &&
			keys.inCar === 'F1',
		'controls API reports saved Keyboard bindings, including custom keys');
	const inputs = raceSetup.keyboardSettings.inputs;
	check(!inputs.has('screenshot'),
		'browser keyboard settings omit screenshots');
	check(content.horns.length > 1 &&
			raceSetup.input('horn').options.length ===
				content.horns.length,
		'horn selector offers the installed horn catalog');
	check(inputs.get('horn').value === 'H' &&
			inputs.get('shiftUp').value === 'S' &&
			inputs.get('shiftDown').value === 'A',
		'keyboard selectors display the actual saved bindings');
	check(inputs.get('inCar').value === 'F1' &&
			inputs.get('cycleCar').value === 'F4' &&
			document.getElementById('keyboard-settings')
				.textContent.replace(/\s+/g, ' ')
				.includes('to pause or resume.'),
		'Settings includes camera keys and fixed page-owned pause');
	for (const id of [-1, 0.5, 4294967296, content.controls.length])
		await rejects(() => player.getControlBindings(id),
			'invalid control profile rejected: ' + id);
	check(!player.call('control_key',
		      'string',
		      ['number', 'number'],
		      [content.controls.length, 0]) &&
			!player.call('control_key',
				'string',
				['number', 'number'],
				[raceSetup.keyboard.id, 18]),
		'native control lookup rejects invalid profile and action indices');
	checkSortedChoices('track', content.tracks);
	checkSortedChoices('car', content.cars);
	checkSortedChoices('horn', content.horns);
	const select = raceSetup.input('resolution');
	check(select.tagName === 'SELECT' && !raceSetup.input('width') &&
			!raceSetup.input('height'),
		'resolution is a single dropdown');
	const options = [...select.options].map((option) => option.value);
	check(options.includes('640x480') && options.includes('1920x1080') &&
			new Set(options).size === options.length,
		'resolution choices include common sizes without duplicates');
	check(content.renderers[0].resolutions.every(
		      (mode) => mode.width < 1024),
		'Software choices respect the existing renderer width limit');
	for (const track of content.tracks.filter((item) => item.available)) {
		raceSetup.input('track').value = track.id;
		raceSetup.input('track').dispatchEvent(new Event('change'));

		const map = document.getElementById('track-map');
		check(!map.hidden && map.width > 0 && map.height > 0 &&
				document.getElementById('track-details')
					.textContent.includes(track.location),
			track.name +
				' selection shows its map and authored details');
	}
	const first = player.getTrackMap(content.tracks[0].id);
	const copy = first.data.slice();
	player.getTrackMap(content.tracks[1].id);
	check(first.data.every((value, index) => value === copy[index]),
		'map pixels remain owned by the caller after another map loads');
	for (const id of [0, -1, 0.5, 4294967297, content.tracks.length + 1])
		await rejects(() => player.getTrackMap(id),
			'invalid map ID rejected: ' + id);
	for (const car of content.cars.filter((item) => item.available)) {
		raceSetup.input('car').value = car.id;
		raceSetup.input('car').dispatchEvent(new Event('change'));
		const meters =
			[...document.querySelectorAll('#car-details meter')];
		check(car.ratings ? meters.length === 3 &&
					meters.every(
						(meter) => meter.value >= 0 &&
							meter.value <= 1)
				  : meters.length === 0,
			car.name + ' shows only available authored ratings');
	}
}

async function exerciseRebinding() {
	const id = raceSetup.keyboard.id;
	const before = JSON.stringify(player.getControlBindings(id));
	for (const [profile, action, key] of [[-1, 'horn', 'J'],
		     [id, 'missing', 'J'],
		     [id, 'horn', 'Esc'],
		     [id, 'horn', 'Undefined00'],
		     [id, 'horn', 'JoyButton1'],
		     [id, 'horn', 'Invalid'],
		     [id, 'horn', ''],
		     [id, 'horn', 'W\0bad'],
		     [id, 'screenshot', 'F12'],
		     [id, 'menu', 'P'],
		     [id, 'mirror', 'M'],
		     [id, 'chat', 'T']])
		await rejects(
			() => player.setControlBinding(profile, action, key),
			'invalid or reserved rebind rejected: ' +
				JSON.stringify([profile, action, key]));
	check(JSON.stringify(player.getControlBindings(id)) === before,
		'rejected binding changes preserve the profile');
	check(!player.call('bind_key',
		      'number',
		      ['number', 'number', 'string'],
		      [id, 99, 'W']),
		'native binding editor rejects unknown actions');
	raceSetup.keyboardSettings.inputs.get('accelerate').value = 'W';
	raceSetup.keyboardSettings.inputs.get('horn').value = 'J';
	check(JSON.stringify(player.getControlBindings(id)) === before,
		'page stages binding edits until race start');
}

function setupRace(mode = 0) {
	const content = player.getContent();
	const track = content.tracks.find(
		(entry) => entry.name.toLowerCase().replaceAll(' ', '') ===
			'redrock');
	check(!!track?.available, 'installed RedRock is available');
	raceSetup.input('track').value = track.id;
	raceSetup.input('track').dispatchEvent(new Event('change'));
	checkMusicChoices(track);
	raceSetup.input('mode').value = mode;
	raceSetup.input('name').value = 'Web Racer';
	raceSetup.input('team').value = 'TEAM';
	raceSetup.input('nameColor').value = 0xdc180a;
	raceSetup.input('horn').value = content.horns.at(-1).id;
	raceSetup.input('laps').value = 1;
	raceSetup.input('resolution').value = '640x480';
	raceSetup.input('showFPS').checked = true;
	raceSetup.input('effectsVolume').value = 0;
	raceSetup.input('musicVolume').value = 0;
}

function checkMusicChoices(track) {
	const select = raceSetup.input('musicTrack');
	const music =
		player.getContent().music.filter((item) => item.available);
	if (!music.length) {
		check(select.disabled && select.value === '0',
			'packages without music show a disabled selector and preserve course defaults');
		return;
	}
	check(!select.disabled &&
			music.every((item) => [...select.options].some(
					    (option) => Number(option.value) ===
						    item.id)),
		'music selector offers available tracks with their durations');
	const selected =
		music.find((item) => item.id !==
				player.readTrackDetails(track.id).musicTrack) ||
		music[0];
	select.value = selected.id;
	select.dispatchEvent(new Event('change'));
	const other = player.getContent().tracks.find(
		(item) => item.available && item.id !== track.id);
	raceSetup.input('track').value = other.id;
	raceSetup.input('track').dispatchEvent(new Event('change'));
	const saved = player.readTrackDetails(other.id).musicTrack;
	check(Number(select.value) ===
			(music.some((item) => item.id === saved) ? saved : 0),
		'changing course restores its own music selection');
	raceSetup.input('track').value = track.id;
	raceSetup.input('track').dispatchEvent(new Event('change'));
	check(Number(select.value) === selected.id,
		'switching back retains the pending music choice');
	sessionStorage.setItem('expected-music', selected.id);
}

async function startFromForm() {
	document.getElementById('race-tab').click();
	window.scrollTo(0, 0);
	raceSetup.form.requestSubmit();
	await waitFor(
		() => player.state === 'racing', 'web form starts race', 50);
	await waitFor(
		() => game.flow?.stage === 'race' && game.flow.frames > 10,
		'race renders',
		30);
	const music = Number(raceSetup.input('musicTrack').value) ||
		player.readTrackDetails(Number(raceSetup.input('track').value))
			.musicTrack;
	check(game.flow.musicTrack === music &&
			player.getSettings().sound.musicTrack === music,
		'race session and saved course settings use the selected music track');
	await waitFor(() => !raceSetup.starting, 'race view positioned', 10);
	check(raceSetup.message.textContent === '',
		'race start leaves no ready status message');
	check(document.getElementById('continue-race').hidden,
		'finish prompt is hidden during racing');
	const bounds = canvas.getBoundingClientRect();
	check(bounds.top >= -1 && bounds.bottom <= innerHeight + 1 &&
			document.activeElement === canvas,
		'race starts with its whole canvas in view and keyboard focus');
	check(!document.getElementById('race-controls') &&
			!document.getElementById('driving-hints'),
		'keyboard settings no longer occupy the race view');
	check(!raceSetup.actions.hidden && !raceSetup.form.hidden &&
			document.getElementById('race-overlay').open,
		'race floats above the form with page controls');
	const keys = player.getControlBindings(raceSetup.keyboard.id);
	check(keys.accelerate === 'W' && keys.horn === 'J',
		'race uses the edited Keyboard profile');
	const saved =
		game.FS.readFile('/userdata/keyboard.clo', {encoding: 'utf8'});
	check(/Accelerate\s+W/.test(saved) && /Horn\s+J/.test(saved),
		'bindings are saved through the control store');
	await rejects(() => player.setControlBinding(
			      raceSetup.keyboard.id, 'accelerate', 'E'),
		'bindings cannot change during a live race');
	check(game.flow.milliseconds >= 0,
		'race runs through the existing session');
	const settings = player.getSettings();
	check(settings.horn === player.getContent().horns.at(-1).id,
		'race uses the selected horn');
	check(settings.player.team === 'TEAM',
		'race retains the four-character driver team');
	check(settings.player.color === 0xdc180a,
		'race uses the selected name color');
	check(player.getContent()
				.controls
				.find((item) => item.id === settings.controls)
				?.name === 'Keyboard',
		'race saves and uses the Keyboard profile');
}

async function recoverGraphics() {
	const extension =
		canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
	check(!!extension, 'browser supports graphics recovery test');
	extension.loseContext();
	await waitFor(() => player.lifecycle.contextLost,
		'graphics loss pauses the race');
	extension.restoreContext();
	await waitFor(
		() => !player.lifecycle.contextLost && !player.lifecycle.paused,
		'graphics resources restored',
		30);
	const before = game.flow.frames;
	await waitFor(() => game.flow.frames > before + 5,
		'render after graphics restoration',
		30);
	check(player.state === 'racing',
		'race recovers with queued GPU visibility downloads');
}

async function exerciseFocusRecovery() {
	// SDL receives window focus events as well as the page lifecycle events.
	for (const hideFirst of [false, true]) {
		if (hideFirst)
			player.lifecycle.hide();
		window.dispatchEvent(new FocusEvent('blur'));
		await sleep(150);
		if (!hideFirst)
			player.lifecycle.hide();
		const hiddenTime = game.flow.milliseconds;
		await sleep(200);
		check(game.flow.milliseconds === hiddenTime,
			'hidden race stops time');

		window.dispatchEvent(new FocusEvent('focus'));
		player.lifecycle.show();
		await sleep(200);
		check(game.flow.milliseconds === hiddenTime &&
				player.lifecycle.userPaused &&
				document.getElementById('pause-race')
						.textContent === 'Resume',
			'focus return keeps the race paused with a visible Resume action');
		document.getElementById('pause-race').click();
		// The first return can still be in the flyover/countdown.
		await waitFor(() => game.flow.milliseconds > hiddenTime,
			'Resume after focus return advances the race',
			30);
		check(!game.flow.paused && !player.lifecycle.paused,
			'Resume clears the pause after focus return');
	}

	player.pause();
	window.dispatchEvent(new FocusEvent('blur'));
	player.lifecycle.hide();
	window.dispatchEvent(new FocusEvent('focus'));
	player.lifecycle.show();
	const pausedTime = game.flow.milliseconds;
	await sleep(200);
	check(game.flow.milliseconds === pausedTime &&
			player.lifecycle.userPaused,
		'focus return preserves an explicit page pause');
	document.getElementById('pause-race').click();
	await waitFor(() => game.flow.milliseconds > pausedTime,
		'Resume button works after tab switching while paused',
		5);
	canvas.dispatchEvent(
		new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
	check(player.lifecycle.userPaused,
		'Escape still pauses after focus recovery');
	const escapeTime = game.flow.milliseconds;
	canvas.dispatchEvent(
		new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
	await waitFor(() => game.flow.milliseconds > escapeTime,
		'Escape resumes after focus recovery',
		5);
}

async function pauseAndLeave() {
	await rejects(() => player.startRace({}),
		'second launch rejected while racing');
	player.pause();
	const before = game.flow.milliseconds;
	await sleep(400);
	check(game.flow.milliseconds === before &&
			game.suspension?.suspended !== 0,
		'page pause stops race time');
	// Hiding/showing or graphics recovery must not undo an explicit user pause.
	player.lifecycle.hide();
	player.lifecycle.show();
	check(player.lifecycle.paused && player.lifecycle.userPaused,
		'visibility changes retain manual pause');
	player.resume();
	await waitFor(() => game.flow.milliseconds > before,
		'resume advances race',
		15);
	const result = await player.leaveRace();
	check(player.state === 'finished' && Array.isArray(result),
		'leave returns results to the page');
	check(!raceSetup.form.hidden && raceSetup.actions.hidden &&
			document.getElementById('results-overlay').open,
		'leave opens floating results');
	document.getElementById('close-results').click();
	document.getElementById('race-tab').click();
	check(!document.getElementById('race-panel').hidden &&
			raceSetup.results.querySelectorAll('tbody tr').length >
				0,
		'returning to race configuration retains the latest results');
	checkDriverKeyboard();
}

function checkDriverKeyboard() {
	document.getElementById('race-tab').click();
	for (const field of ['name', 'team']) {
		const input = raceSetup.input(field);
		input.focus();
		check(document.activeElement === input,
			field + ' field accepts focus');
		for (const [key, code, keyCode, ctrlKey = false] of [
			     ['x', 'KeyX', 88],
			     ['Backspace', 'Backspace', 8],
			     ['ArrowLeft', 'ArrowLeft', 37],
			     ['Tab', 'Tab', 9],
			     ['a', 'KeyA', 65, true]]) {
			for (const type of ['keydown', 'keypress', 'keyup']) {
				const event = new KeyboardEvent(type, {
					key,
					code,
					keyCode,
					which: keyCode,
					ctrlKey,
					bubbles: true,
					cancelable: true
				});
				check(input.dispatchEvent(event),
					field + ' retains browser ' + type +
						' handling for ' + key);
			}
		}
	}
}

async function finishRace(skip = false) {
	await startFromForm();
	await waitFor(() => !document.getElementById('continue-race').hidden,
		'finish prompt appears when the player crosses the line',
		300);
	check(game.flow.finished && player.state === 'racing',
		'finish prompt leaves the original finish view running');
	const finishTime = performance.now();
	canvas.dispatchEvent(new KeyboardEvent(
		'keydown', {key: 'ArrowUp', repeat: true, bubbles: true}));
	await new Promise((resolve) => setTimeout(resolve, 100));
	check(player.state === 'racing',
		'held accelerator does not skip the finish view');
	if (skip) {
		canvas.dispatchEvent(new KeyboardEvent(
			'keydown', {key: 'x', bubbles: true}));
		await waitFor(() => player.state === 'finished',
			'fresh key skips finish view',
			5);
		check(performance.now() - finishTime < 5000,
			'finish view can be skipped before its deadline');
	}
	await waitFor(
		() => player.state === 'finished' || player.state === 'failed',
		'AI completes one real lap',
		300);
	check(player.state === 'finished',
		'natural finish returns to webpage without a results-menu keypress');
	const results = player.results();
	check(results.length === 8 && results[0].finished &&
			results[0].milliseconds > 0,
		'finished event exposes real eight-car standings and player time');
	check(!raceSetup.results.hidden && !raceSetup.form.hidden &&
			document.getElementById('results-overlay').open,
		'natural finish opens floating results');
	check(document.getElementById('continue-race').hidden,
		'finish prompt clears on return to results');
	if (!skip)
		check(performance.now() - finishTime >= 9000,
			'without input the original finish view runs to its deadline');
	document.getElementById('close-results').click();
	document.getElementById('results-tab').click();
	await checkSavedHistory();
	checkDriverKeyboard();
}

async function checkSavedHistory() {
	await waitFor(() => !game.storage.dirty && game.storage.status === 0,
		'race history becomes durable',
		15);
	const saved = JSON.parse(game.FS.readFile(
		'/userdata/racehistory.json', {encoding: 'utf8'}));
	check(saved.races[0].rows[0].finished &&
			saved.races[0].driver === 'Web Racer',
		'completed race and driver are stored in race history');
	const select = document.getElementById('race-history');
	check(select.options.length === saved.races.length &&
			select.options.length >= 2,
		'history offers previous sessions as well as the completed race');
	select.value = '1';
	select.dispatchEvent(new Event('change'));
	check(document.querySelectorAll('#race-result-rows tr').length ===
			saved.races[1].rows.length,
		'selecting a previous race shows its standings');
	sessionStorage.setItem('expected-race-history', JSON.stringify(saved));
}

async function run() {
	if (sessionStorage.getItem('frontend-picker-check')) {
		await packages.ready;
		await waitFor(() => !launcher.hidden,
			'explicit package switch shows picker',
			15);
		check(!raceSetup && packages.file && !packages.section.hidden,
			'Explicit package switching returns to picker and keeps the remembered assets');
		check(!new URL(location.href)
				.searchParams.has('choose-package'),
			'package picker bypass is consumed so future reloads open race setup');
		packages.playButton.click();
		await waitFor(() => raceSetup,
			'reuse package from explicit picker',
			45);
		check(player.state === 'ready',
			'remembered package remains playable after opening picker');
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
		return;
	}
	await openFrontend();
	if (location.search === '?reload') {
		const expected = JSON.parse(
			sessionStorage.getItem('expected-race-history'));
		check(document.getElementById('race-history').options.length ===
					expected.races.length &&
				!raceSetup.results.hidden &&
				raceSetup.results.textContent.includes(
					'Web Racer'),
			'race history and latest standings return after a full reload');
		check(JSON.stringify(JSON.parse(
			      game.FS.readFile('/userdata/racehistory.json',
				      {encoding: 'utf8'}))) ===
				JSON.stringify(expected),
			'reload preserves every recorded race result');
		const settings = player.getSettings();
		if (sessionStorage.getItem('expected-music'))
			check(settings.sound.musicTrack ===
						Number(sessionStorage.getItem(
							'expected-music')) &&
					Number(raceSetup.input('musicTrack')
							.value) ===
						settings.sound.musicTrack,
				'course music choice survives a full page reload');
		check(raceSetup.input('resolution').value === '640x480',
			'saved resolution takes precedence over the web default');
		check(settings.player.name === 'Web Racer' &&
				settings.player.team === 'TEAM' &&
				raceSetup.input('team').value === 'TEAM' &&
				settings.graphics.showFPS === 1 &&
				settings.laps === 1,
			'web settings persist across full page reload');
		check(settings.horn === player.getContent().horns.at(-1).id &&
				Number(raceSetup.input('horn').value) ===
					settings.horn,
			'horn selection persists across reload');
		check(settings.player.color === 0xdc180a &&
				Number(raceSetup.input('nameColor').value) ===
					0xdc180a,
			'name color persists across full page reload');
		check([...raceSetup.input('nameColor').options].some(
			      (option) => Number(option.value) === 0xffffff),
			'default white remains selectable after saving another color');
		check(raceSetup.keyboardSettings.inputs.get('accelerate')
						.value === 'W' &&
				raceSetup.keyboardSettings.inputs.get('horn')
						.value === 'J',
			'edited bindings survive a full page reload');
		setupRace(2);
		await startFromForm();
		await pauseAndLeave();
		check(player.results().length === 1,
			'Time Attack uses the same API with one car');
		sessionStorage.setItem('flow-checks', JSON.stringify(checks));
		sessionStorage.setItem('frontend-picker-check', '1');
		chooseAnotherPackage();
		return;
	}
	exerciseTabs();
	exerciseHiddenValidation();
	await exerciseSelector();
	await exerciseValidation();
	await exerciseRebinding();
	setupRace();
	await startFromForm();
	await exerciseFocusRecovery();
	await recoverGraphics();
	await pauseAndLeave();
	await finishRace();
	await finishRace(true);
	check(/RecordRace\s+On/.test(game.FS.readFile(
		      '/userdata/motorhead.cfg', {encoding: 'utf8'})),
		'web races preserve the original frontend recording preference');
	check(!game.storage.snapshot().entries.some(
		      (entry) => /\.mde$/i.test(entry.path)),
		'web races do not leave an unnamed recording');
	check(game.storage.snapshot().entries.every(
		      (entry) => !entry.directory &&
			      !entry.path.includes('/') &&
			      entry.path === entry.path.toLowerCase()),
		'settings, controls and race results use flat lowercase user filenames');
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.search = '?reload';
}

run().catch((reason) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify({
		passed: false,
		checks,
		error: reason.stack || String(reason),
		state: game?.flow,
		frontend: player?.state,
		message: raceSetup?.message.textContent,
		files: game?.storage.snapshot().entries.map(
			({path, directory}) => ({path, directory}))
	})
}));
