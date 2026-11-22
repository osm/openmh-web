'use strict';

const checks = [];

function check(value, message) {
	if (!value)
		throw new Error(message);
	checks.push(message);
}

async function resetControls() {
	let calls = 0, selected, release, unavailable = false;
	const tools =
		new OpenMHSaveTools(async () => ({}), async (categories) => {
			calls++;
			selected = categories;
			await new Promise((resolve) => {
				release = resolve;
			});
			throw new Error('Synthetic reset failure');
		}, () => unavailable);
	tools.resetButton.click();
	check(tools.resetDialog.open &&
			tools.resetChoices()
					.filter((input) => input.checked)
					.map((input) => input.name)
					.join(',') === 'settings,controls',
		'reset dialog initially selects only settings and key bindings');
	document.getElementById('reset-cancel').click();
	check(!tools.resetDialog.open && calls === 0,
		'cancelling reset changes nothing');
	unavailable = true;
	tools.resetButton.click();
	check(!tools.resetDialog.open,
		'reset is unavailable during a race or connection');
	unavailable = false;
	tools.resetButton.click();
	for (const input of tools.resetChoices())
		input.checked = false;
	tools.resetForm.dispatchEvent(new Event('change', {bubbles: true}));
	check(tools.resetConfirm.disabled,
		'an empty reset selection cannot be submitted');
	document.getElementById('reset-all').click();
	check(tools.resetChoices().every((input) => input.checked),
		'select all includes all five reset categories');
	for (const input of tools.resetChoices())
		input.checked = input.name === 'history';
	tools.resetForm.dispatchEvent(new Event('change', {bubbles: true}));
	tools.resetForm.requestSubmit();
	check(calls === 1 && selected.join(',') === 'history' && tools.busy,
		'only the selected reset category reaches the reset operation');
	check(tools.resetConfirm.disabled &&
			document.getElementById('reset-options').disabled &&
			document.getElementById('reset-cancel').disabled,
		'reset selection and duplicate submissions are locked during persistence');
	const cancel = new Event('cancel', {cancelable: true});
	tools.resetDialog.dispatchEvent(cancel);
	check(cancel.defaultPrevented,
		'Escape cannot dismiss an in-flight reset');
	release();
	while (tools.busy)
		await new Promise((resolve) => setTimeout(resolve, 0));
	check(tools.resetDialog.open &&
			tools.resetStatus.textContent ===
				'Synthetic reset failure' &&
			!tools.resetConfirm.disabled,
		'reset failures remain visible and can be retried');
	document.getElementById('reset-cancel').click();
}

async function run() {
	await resetControls();
	const player = new TestPlayer();
	player.bindings.horn = 'F11';
	player.bindings.brake = 'P';
	const canvas = document.getElementById('canvas');
	history.replaceState(null, '', '?check=tabs#launcher-settings');
	const launcherNavigation = new OpenMHTabs(
		document.querySelector('#launcher [role="tablist"]'),
		{preserveUnknown: true});
	check(!document.getElementById('launcher-settings').hidden,
		'launcher settings restore from their URL');
	launcherNavigation.select('picker');
	check(location.hash === '#play',
		'launcher tabs also update their URLs');
	history.replaceState(null, '', '?check=tabs#single-player/results');
	const setup = new OpenMHRaceSetup(player, canvas);
	check(!document.getElementById('single-player-panel').hidden &&
			!document.getElementById('results-panel').hidden &&
			document.getElementById('race-panel').hidden,
		'initial results URL opens both the parent and the requested subtab');
	check([...setup.navigation.list.querySelectorAll('[role="tab"]')]
				.map((tab) => tab.textContent.trim())
				.join(',') ===
			'Single player,Multiplayer,Settings',
		'main navigation groups results under Single player');
	setup.selectTab('settings-panel');
	setup.selectTab('multiplayer-panel');
	check(location.hash === '#multiplayer' &&
			location.search === '?check=tabs',
		'tab selection updates the URL without changing query parameters');
	const length = history.length;
	setup.selectTab('multiplayer-panel');
	check(history.length === length,
		'selecting the current tab does not duplicate history');
	const previous =
		new Promise((resolve) => window.addEventListener(
				    'popstate', resolve, {once: true}));
	history.back();
	await previous;
	check(!document.getElementById('settings-panel').hidden &&
			location.hash === '#settings',
		'browser Back restores the previous tab');
	const next = new Promise((resolve) => window.addEventListener(
					 'popstate', resolve, {once: true}));
	history.forward();
	await next;
	check(!document.getElementById('multiplayer-panel').hidden,
		'browser Forward restores the next tab');
	const changed =
		new Promise((resolve) => window.addEventListener(
				    'hashchange', resolve, {once: true}));
	location.hash = '#single-player/results';
	await changed;
	check(!document.getElementById('results-panel').hidden &&
			!document.getElementById('single-player-panel')
				.hidden &&
			document.getElementById('single-player-tab')
					.getAttribute('aria-selected') ===
				'true',
		'editing the hash selects the nested tab and its parent');
	document.getElementById('results-tab')
		.dispatchEvent(new KeyboardEvent(
			'keydown', {key: 'ArrowLeft', bubbles: true}));
	check(location.hash === '#single-player' &&
			document.activeElement.id === 'race-tab' &&
			document.getElementById('results-panel').hidden,
		'submenu arrow navigation stays within Single player');
	document.getElementById('race-tab')
		.dispatchEvent(new KeyboardEvent(
			'keydown', {key: 'End', bubbles: true}));
	check(location.hash === '#single-player/results' &&
			document.activeElement.id === 'results-tab',
		'submenu End selects Results instead of a main menu tab');
	const subBack = new Promise((resolve) => window.addEventListener(
					    'popstate', resolve, {once: true}));
	history.back();
	await subBack;
	check(location.hash === '#single-player' &&
			!document.getElementById('race-panel').hidden &&
			document.getElementById('results-panel').hidden,
		'Back restores the previous single-player subtab');
	const subForward =
		new Promise((resolve) => window.addEventListener(
				    'popstate', resolve, {once: true}));
	history.forward();
	await subForward;
	check(location.hash === '#single-player/results' &&
			!document.getElementById('results-panel').hidden,
		'Forward restores saved results navigation');
	document.getElementById('single-player-tab').click();
	check(location.hash === '#single-player' &&
			!document.getElementById('race-panel').hidden,
		'the Single player menu opens Race by default');
	document.getElementById('single-player-tab')
		.dispatchEvent(new KeyboardEvent(
			'keydown', {key: 'ArrowRight', bubbles: true}));
	check(location.hash === '#multiplayer' &&
			document.activeElement.id === 'multiplayer-tab',
		'keyboard tab navigation updates the URL and focus');
	const unknown =
		new Promise((resolve) => window.addEventListener(
				    'hashchange', resolve, {once: true}));
	location.hash = '#unknown-tab';
	await unknown;
	check(location.hash === '#single-player' &&
			!document.getElementById('race-panel').hidden,
		'unknown hashes safely fall back to the race tab');

	check(!setup.section.hidden && canvas.hidden,
		'setup opens without an engine or assets');
	check([...setup.input('car').options]
				.map((item) => item.text)
				.join(',') === 'Alpha,Zeta',
		'available cars are sorted without changing catalog IDs');
	check(setup.input('car').value === '2',
		'saved car ID survives alphabetical sorting');
	check(setup.input('musicTrack').value === '3',
		'course music comes from public catalog metadata');
	const music = setup.content.music;
	for (const unavailable of [[],
		     music.map((item) => ({...item, available: false}))]) {
		setup.content.music = unavailable;
		setup.populateMusic();
		check(setup.input('musicTrack').closest('label').hidden &&
				setup.configuration().sound.musicTrack === 0,
			'absent music hides the full control and uses no track');
	}
	setup.content.music = music;
	setup.populateMusic();
	check(!setup.input('musicTrack').closest('label').hidden &&
			!setup.input('musicTrack').disabled &&
			setup.input('musicTrack').value === '3',
		'available music restores the selector and course default');
	check(document.getElementById('track-map-status').textContent ===
			'Track map unavailable.',
		'missing map has a usable fallback');
	check(setup.input('showPlayerNames').checked,
		'saved nameplate visibility populates Graphics');
	setup.input('showPlayerNames').checked = false;
	setup.input('name').value = 'UI Racer';
	setup.input('name').dispatchEvent(new Event('change'));
	setup.input('musicTrack').value = '2';
	const keys = setup.keyboardSettings.inputs;
	for (const [action, shortcut] of [['horn', 'F11'], ['brake', 'P']]) {
		check(![...keys.get('accelerate').options].some(
			      option => option.value === shortcut),
			shortcut + ' is reserved for the race controls');
		const saved = keys.get(action).selectedOptions[0];
		check(saved.value === shortcut && saved.disabled,
			'an existing ' + shortcut +
				' binding is preserved until replaced');
	}
	keys.get('accelerate').value = 'W';
	await setup.start();
	check(player.configuration.graphics.showPlayerNames === false,
		'hidden player names reach the single-player API');
	check(player.configuration.player.name === 'UI Racer',
		'edited name reaches the race API');
	check(player.configuration.sound.musicTrack === 2,
		'selected music reaches the race API');
	check(player.bindings.horn === 'F11' && player.bindings.brake === 'P',
		'starting a race preserves imported shortcut bindings');
	check(player.bindings.accelerate === 'W',
		'keyboard edits use the public binding API');
	check(!setup.form.hidden && !canvas.hidden && !setup.actions.hidden &&
			setup.view.dialog.open,
		'race opens above the visible page');
	check(setup.view.shell.contains(setup.pause) &&
			setup.view.shell.contains(setup.leave),
		'race controls float with the game frame');
	check(setup.view.notices.contains(setup.message),
		'race messages stay visible inside the overlay');
	const graphics = setup.configuration().graphics;
	check(Number(setup.view.dialog.style.getPropertyValue(
		      '--race-aspect')) === graphics.width / graphics.height,
		'overlay proportions follow the selected resolution');
	const cancel = new Event('cancel', {cancelable: true});
	setup.view.dialog.dispatchEvent(cancel);
	check(cancel.defaultPrevented && setup.view.dialog.open,
		'Escape cannot dismiss a running game');
	setup.input('name').focus();
	check(setup.view.dialog.contains(document.activeElement),
		'modal keeps keyboard focus out of the dimmed page');
	setup.pause.click();
	check(player.isPaused() && setup.pause.textContent === 'Resume',
		'pause button calls the public pause API');
	setup.pause.click();
	check(!player.isPaused() && setup.pause.textContent === 'Pause',
		'resume button restores the race');
	const originalConfiguration = JSON.stringify(player.configuration);
	const starts = player.starts;
	setup.input('laps').value = '7';
	setup.pause.click();
	setup.restartButton.click();
	setup.restartButton.click();
	check(setup.restartButton.hidden && setup.leave.disabled &&
			setup.view.dialog.open,
		'restarting keeps the race frame open and blocks conflicting actions');
	while (setup.starting)
		await new Promise((resolve) => setTimeout(resolve, 10));
	check(player.starts === starts + 1 && !player.isPaused() &&
			JSON.stringify(player.configuration) ===
				originalConfiguration,
		'restart runs once, resumes a paused race and preserves its original settings');
	check(!setup.resultView.dialog.open && setup.view.dialog.open &&
			!setup.restartButton.hidden && !setup.leave.disabled &&
			document.activeElement === canvas,
		'restart returns focus to the race without showing intermediate results');
	setup.input('laps').value = String(player.configuration.laps);
	check(setup.view.tools.nextElementSibling.id === 'race-view',
		'race controls appear above the frame');
	const pauseKey = (options = {}, target = canvas) => {
		const event = new KeyboardEvent('keydown', {
			key: 'p',
			bubbles: true,
			cancelable: true,
			...options
		});
		target.dispatchEvent(event);
		return event;
	};
	check(!pauseKey().defaultPrevented && !player.isPaused(),
		'P remains available to game bindings outside fullscreen');
	setup.pause.click();
	const isFullscreen = setup.view.isFullscreen;
	setup.view.isFullscreen = () => true;
	check(pauseKey({}, setup.view.shell).defaultPrevented &&
			!player.isPaused(),
		'P resumes a race paused before fullscreen even with shell focus');
	check(pauseKey({repeat: true}).defaultPrevented && !player.isPaused(),
		'holding P does not toggle repeatedly or reach game input');
	check(pauseKey({key: 'P'}).defaultPrevented && player.isPaused(),
		'uppercase P pauses a fullscreen race');
	check(!pauseKey({ctrlKey: true}).defaultPrevented && player.isPaused(),
		'fullscreen pause leaves modified browser shortcuts alone');
	pauseKey();
	check(!player.isPaused(), 'P resumes a fullscreen race');
	setup.view.isFullscreen = isFullscreen;
	let fullscreenToggles = 0;
	const toggleFullscreen = setup.view.toggleFullscreen;
	setup.view.toggleFullscreen = () => fullscreenToggles++;
	const fullscreenKey = new KeyboardEvent(
		'keydown', {key: 'F11', bubbles: true, cancelable: true});
	canvas.dispatchEvent(fullscreenKey);
	canvas.dispatchEvent(new KeyboardEvent('keydown',
		{key: 'F11', bubbles: true, cancelable: true, repeat: true}));
	check(fullscreenKey.defaultPrevented && fullscreenToggles === 1,
		'F11 toggles race fullscreen once without handling repeats');
	const raceRoute = location.hash;
	player.emit('finishline');
	canvas.dispatchEvent(new KeyboardEvent(
		'keydown', {key: 'F11', bubbles: true, cancelable: true}));
	check(fullscreenToggles === 2 && player.state === 'racing',
		'F11 at the finish line does not dismiss the race');
	setup.view.toggleFullscreen = toggleFullscreen;
	check(!setup.continueButton.hidden, 'finish line offers continuation');
	await setup.continueResults();
	check(!setup.form.hidden && canvas.hidden,
		'results release the race canvas');
	check(setup.resultView.dialog.open && location.hash === raceRoute,
		'completion opens a results overlay without navigating to history');
	check(document.getElementById('summary-result-rows')
			.textContent.includes('12.345 s'),
		'results display API times');
	check(!setup.view.dialog.open &&
			!setup.view.dialog.contains(setup.message),
		'return closes the overlay and restores page messages');
	document.getElementById('close-results').click();
	check(!setup.resultView.dialog.open && location.hash === raceRoute,
		'closing results keeps the previous page');
	setup.selectTab('results-panel');
	check(document.getElementById('race-result-rows')
			.textContent.includes('12.345 s'),
		'historical results remain available through the Results tab');
	setup.selectTab(setup.input('name').closest('[role="tabpanel"]').id);
	setup.input('name').focus();
	setup.input('name').value = 'Next Racer';
	setup.input('name').dispatchEvent(new Event('change'));
	check(document.activeElement === setup.input('name'),
		'name input can regain focus after a race');
	player.failure = 'Synthetic startup failure';
	await setup.start();
	check(!setup.form.hidden && canvas.hidden &&
			setup.message.textContent === player.failure,
		'startup failure restores the form and displays the API error');
	setup.busy = () => true;
	await setup.start();
	check(setup.message.textContent.includes('save operation'),
		'save operations prevent overlapping race startup');

	setup.busy = () => false;
	player.failure = '';
	const byId = (id) => document.getElementById(id);
	setup.selectTab('multiplayer-panel');
	const lobby = setup.lobby;
	lobby.url.value = 'https://server.example/';
	check(!!(byId('lobby-connection')
			      .compareDocumentPosition(lobby.driver) &
		      Node.DOCUMENT_POSITION_FOLLOWING),
		'join controls appear before the driver form');
	check([...lobby.car.options].map((option) => option.text).join(',') ===
			'Alpha,Zeta',
		'multiplayer car choices preserve available sorted catalog IDs');
	setup.input('car').value = '2';
	setup.input('car').dispatchEvent(new Event('change'));
	check(lobby.car.value === '2',
		'race car selection updates multiplayer');
	lobby.car.value = '1';
	lobby.car.dispatchEvent(new Event('change'));
	check(setup.input('car').value === '1',
		'multiplayer car selection updates race settings');
	check(lobby.driverName.value === setup.input('name').value &&
			lobby.team.value === setup.input('team').value,
		'driver form starts with the shared identity');
	lobby.team.value = 'FORM';
	lobby.team.dispatchEvent(new Event('input'));
	check(setup.input('team').value === 'FORM',
		'offline driver form edits update shared settings');
	setup.input('team').value = 'TEST';
	setup.input('team').dispatchEvent(new Event('change'));
	check(lobby.team.value === 'TEST',
		'shared settings update the offline driver form');
	const redMap =
		new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
	const greenMap =
		new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);
	player.trackMaps = new Map([[7, redMap], [8, greenMap]]);
	setup.showTrack();
	check(!byId('track-map').hidden &&
			byId('track-map')
					.getContext('2d')
					.getImageData(0, 0, 1, 1)
					.data[0] === 255,
		'single-player renders the public map pixels');
	check(lobby.driver.hidden,
		'driver section stays hidden before connection');
	lobby.password.value = 'secret';
	setup.input('showPlayerNames').checked = false;
	await lobby.join();
	check(player.connection.settings.graphics.showPlayerNames === false,
		'hidden player names also reach multiplayer connection settings');
	check(!byId('multiplayer-connection-status'),
		'connection badge is replaced by unavailable navigation');
	for (const id of ['single-player-tab', 'settings-tab']) {
		const tab = byId(id);
		check(tab.getAttribute('aria-disabled') === 'true' &&
				!tab.disabled,
			'unavailable tab retains interaction for explanation: ' +
				id);
		tab.click();
		check(!lobby.panel.hidden && location.hash === '#multiplayer' &&
				setup.navigationNotice.open &&
				byId('navigation-message')
						.textContent.trim() ===
					'Leave the server before switching tabs.' &&
				player.state === 'lobby',
			'connected clicks explain the restriction without disconnecting');
		check(setup.navigationNotice.matches(':modal') &&
				setup.navigationNotice.contains(
					document.activeElement),
			'explanation is modal and receives keyboard focus');
		setup.navigationNotice.querySelector('button').click();
		check(!setup.navigationNotice.open && player.state === 'lobby',
			'OK dismisses the explanation without leaving the server');
	}
	byId('multiplayer-tab')
		.dispatchEvent(new KeyboardEvent('keydown',
			{key: 'ArrowRight', bubbles: true, cancelable: true}));
	check(!lobby.panel.hidden && location.hash === '#multiplayer' &&
			setup.navigationNotice.contains(document.activeElement),
		'connected keyboard navigation keeps the lobby and focuses its explanation');
	const noticeCancel = new Event('cancel', {cancelable: true});
	setup.navigationNotice.dispatchEvent(noticeCancel);
	check(!noticeCancel.defaultPrevented,
		'explanation permits native Escape dismissal');
	setup.navigationNotice.close();
	check(document.activeElement === byId('multiplayer-tab'),
		'dismissing the explanation restores keyboard focus');
	const blockedHash =
		new Promise((resolve) => window.addEventListener(
				    'hashchange', resolve, {once: true}));
	location.hash = '#settings';
	await blockedHash;
	check(location.hash === '#multiplayer' && !lobby.panel.hidden,
		'connected hash navigation restores the lobby URL');
	history.replaceState(null, '', '#single-player/results');
	window.dispatchEvent(new PopStateEvent('popstate'));
	check(location.hash === '#multiplayer' && !lobby.panel.hidden,
		'connected history navigation restores the lobby URL');
	setup.selectTab('results-panel');
	check(!lobby.panel.hidden && setup.navigationNotice.open &&
			byId('single-player-panel').hidden,
		'programmatic navigation follows the same restriction');
	setup.navigationNotice.close();
	check(!lobby.driver.hidden, 'connected lobby shows the driver section');
	check(setup.controls instanceof OpenMHRaceConfiguration &&
			lobby.controls instanceof OpenMHRaceConfiguration,
		'solo and multiplayer use the shared configuration component');
	check(!lobby.controls.root.querySelector('[data-solo]') &&
			setup.controls.root.querySelector(
				'[name="difficulty"]') &&
			setup.controls.root.querySelector('[name="catchUp"]'),
		'AI and solo-specific options are absent from multiplayer controls');
	check(setup.controls.root.contains(setup.input('name')) &&
			lobby.controls.root.contains(lobby.driverName),
		'both driver cards contain their profile controls');
	const meterValues =
		(root) => [...root.querySelectorAll('.car-details meter')]
				  .map((meter) => meter.value)
				  .join(',');
	check(meterValues(setup.controls.root) === '0.4,0.6,0.8' &&
			meterValues(lobby.controls.root) === '0.4,0.6,0.8',
		'both driver cards render the same selected car ratings');
	check(setup.input('laps').options.length ===
				lobby.laps.options.length &&
			Array.from(lobby.laps.options, option => option.value)
					.join(',') === '1,3,5,7,9,11,13',
		'both modes use the lap range and step from the player schema');
	const ids =
		[...document.querySelectorAll('[id]')].map((node) => node.id);
	check(new Set(ids).size === ids.length,
		'shared control instances have unique document IDs');

	const circuitMap = byId('lobby-track-map');
	check(!circuitMap.hidden &&
			circuitMap.getContext('2d')
					.getImageData(0, 0, 1, 1)
					.data[0] === 255 &&
			byId('lobby-track-details').textContent ===
				'Test area · 1 km',
		'multiplayer uses the confirmed circuit map and shared course details');
	const loads = player.mapLoads;
	player.networkState('lobby');
	check(player.mapLoads === loads,
		'roster updates do not reload an unchanged circuit map');

	check(player.connection.url === lobby.url.value &&
			player.connection.password === 'secret' &&
			player.connection.settings.car === 1 &&
			player.connection.settings.player.name === 'Next Racer',
		'lobby joins through the public API with shared driver settings');
	check(lobby.password.value === '' && lobby.active(),
		'password is cleared after connecting');
	check(setup.input('name').disabled && setup.input('car').disabled,
		'connected lobby locks race and driver settings');
	check(byId('lobby-players').children.length === 2 &&
			!byId('lobby-players').querySelector('img'),
		'roster renders server text without interpreting markup');
	check(byId('lobby-status').textContent === '' &&
			byId('lobby-players')
					.querySelectorAll('.local')
					.length === 1 &&
			!byId('lobby-players').querySelector('.ready'),
		'connected state is clear from the roster without duplicate status text');
	check(byId('lobby-mode').value === '0' &&
			byId('lobby-mode').selectedOptions[0].textContent ===
				'Normal',
		'multiplayer mode zero displays Normal');
	player.networkState('lobby', {mode: 1});
	check(byId('lobby-mode').value === '1' &&
			byId('lobby-mode').selectedOptions[0].textContent ===
				'Elimination',
		'server mode changes display Elimination');
	player.networkState('lobby', {mode: 0});
	check(byId('lobby-mode').value === '0' &&
			byId('lobby-mode').selectedOptions[0].textContent ===
				'Normal',
		'server mode changes restore Normal');
	const mode = byId('lobby-mode');
	mode.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(!player.modeCommands,
		'selecting the current mode does not toggle it');
	player.deferMode = true;
	mode.value = '1';
	mode.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(player.modeCommands === 1 && mode.value === '0',
		'mode selection uses the toggle command and waits for server confirmation');
	player.deferMode = false;
	player.networkState('lobby', {mode: 1});
	player.modeLocked = true;
	mode.value = '0';
	mode.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(mode.value === '1' &&
			byId('lobby-chat-log')
				.textContent.includes('Gamemode locked!'),
		'locked mode changes retain the server value and show its reply');
	player.modeLocked = false;
	player.commandFailure = 'Disconnected';
	mode.value = '0';
	mode.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(mode.value === '1' && lobby.status.textContent === 'Disconnected',
		'failed mode changes restore the confirmed value');
	player.commandFailure = '';
	mode.value = '0';
	mode.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(mode.value === '0' && player.network.mode === 0,
		'accepted mode changes display the confirmed selection');
	const laps = byId('lobby-laps');
	check(laps.value === '3', 'lap selector displays the server count');
	player.deferLaps = true;
	laps.value = '7';
	laps.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(player.lapsCommand === '/laps 7' && laps.value === '3',
		'lap changes use the command API and wait for server confirmation');
	player.deferLaps = false;
	player.networkState('lobby', {laps: 7});
	check(laps.value === '7',
		'server confirmation updates the lap selector');
	player.lapsLocked = true;
	laps.value = '9';
	laps.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(laps.value === '7' &&
			byId('lobby-chat-log')
				.textContent.includes('Laps locked!'),
		'locked lap changes retain the server value and show its reply');
	player.lapsLocked = false;
	player.commandFailure = 'Disconnected';
	laps.value = '5';
	laps.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(laps.value === '7' && lobby.status.textContent === 'Disconnected',
		'failed lap commands restore the server value and explain failure');
	player.commandFailure = '';
	laps.value = '3';
	laps.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(laps.value === '3' && player.network.laps === 3,
		'accepted lap changes display the confirmed count');
	player.networkState('lobby', {notice: '<b>Waiting for drivers</b>'});
	check(byId('lobby-console').contains(byId('lobby-notice')) &&
			byId('lobby-notice').textContent ===
				'Server: <b>Waiting for drivers</b>' &&
			!byId('lobby-notice').querySelector('b'),
		'server notices stay in the console and render as text');
	lobby.status.textContent = 'Check your command';
	player.networkState('lobby');
	check(lobby.status.textContent === 'Check your command',
		'roster refreshes preserve actionable errors');
	const consoleBox = byId('lobby-console');
	const consoleHeight = consoleBox.getBoundingClientRect().height;
	const commandOutput = byId('lobby-command-output');
	commandOutput.hidden = false;
	commandOutput.textContent = 'A long help line\n'.repeat(100);
	check(consoleBox.getBoundingClientRect().height === consoleHeight &&
			consoleBox.scrollHeight > consoleBox.clientHeight,
		'long command replies scroll inside the console instead of growing the page');
	commandOutput.textContent = '';
	commandOutput.hidden = true;
	const track = byId('lobby-track-select');
	check([...track.options].map((option) => option.value).join(',') ===
			'Night circuit,Synthetic course',
		'track choices are sorted and include installed courses locked in solo play');
	player.deferTrack = true;
	track.value = 'Night circuit';
	track.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(player.trackCommand === '/track Night circuit' &&
			track.value === 'Synthetic course',
		'track selection sends its full name and waits for the server');
	player.deferTrack = false;
	player.networkState('lobby', {track: 'Night circuit'});
	check(!circuitMap.hidden &&
			circuitMap.getContext('2d')
					.getImageData(0, 0, 1, 1)
					.data[1] === 255 &&
			circuitMap.getAttribute('aria-label') ===
				'Night circuit track layout',
		'confirmed track changes replace the map and its accessible label');

	check(track.value === 'Night circuit',
		'server track changes update the dropdown');
	player.trackLocked = true;
	track.value = 'Synthetic course';
	track.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(track.value === 'Night circuit' &&
			byId('lobby-chat-log')
				.textContent.includes('Track locked!'),
		'locked track changes retain the server selection and explain rejection');
	player.trackLocked = false;
	player.commandFailure = 'Disconnected';
	track.value = 'Synthetic course';
	track.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(track.value === 'Night circuit',
		'failed track commands restore the server value');
	player.commandFailure = '';
	track.value = 'Synthetic course';
	track.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(track.value === 'Synthetic course' &&
			player.network.track === 'Synthetic course',
		'accepted track selection displays the confirmed course');
	player.networkState('lobby', {track: 'Custom server course'});
	check(circuitMap.hidden &&
			byId('lobby-track-map-status').textContent ===
				'Track map unavailable.' &&
			byId('lobby-track-details').textContent === '',
		'unknown courses clear the previous map and details');

	check(track.value === 'Custom server course' &&
			track.options.length === 3,
		'a server course outside the installed catalog stays visible');
	player.networkState('lobby', {track: 'synthetic COURSE'});
	check(track.value === 'Synthetic course' && track.options.length === 2,
		'track names match without case and stale server-only choices are removed');
	player.networkState('lobby', {track: 'Synthetic course'});
	player.brokenMap = 8;
	player.networkState('lobby', {track: 'Night circuit'});
	check(circuitMap.hidden &&
			byId('lobby-track-map-status').textContent ===
				'Track map unavailable.',
		'map decoding failures preserve a usable lobby');
	player.brokenMap = undefined;
	player.networkState('lobby', {track: 'Synthetic course'});
	check(!circuitMap.hidden &&
			byId('lobby-track-map-status').textContent === '',
		'a valid circuit restores the preview after a map failure');

	player.network.chat = [];
	player.networkState('lobby');
	await setup.start();
	check(!lobby.panel.hidden && player.state === 'lobby',
		'single-player cannot start while connected');
	check(byId('lobby-connection').hidden &&
			!lobby.car.matches(':disabled'),
		'join section hides while connected and car selection remains available');
	check(!lobby.driverName.matches(':disabled') &&
			!lobby.applyProfile.hidden,
		'connected lobby enables driver fields and Apply');
	lobby.driverName.value = 'Draft Name';
	lobby.driverName.dispatchEvent(new Event('input'));
	player.networkState('lobby');
	check(lobby.driverName.value === 'Draft Name' &&
			player.network.players[0].name !== 'Draft Name',
		'roster updates preserve an unapplied driver draft');
	lobby.team.value = '';
	lobby.team.dispatchEvent(new Event('input'));
	lobby.color.value = String(0xffffff);
	lobby.color.dispatchEvent(new Event('input'));
	player.profileFailure = 'Server is busy';
	lobby.applyProfile.click();
	await Promise.resolve();
	check(lobby.driverName.value === 'Draft Name' &&
			lobby.status.textContent === 'Server is busy',
		'failed profile update preserves the draft for retry');
	player.profileFailure = '';
	lobby.applyProfile.click();
	await Promise.resolve();
	check(player.network.players[0].name === 'Draft Name' &&
			player.network.players[0].team === '' &&
			player.network.players[0].color === 0xffffff,
		'driver form preserves spaces, clears the team and updates player color');
	check(setup.input('name').value === 'Draft Name' &&
			setup.input('team').value === '' &&
			Number(setup.input('nameColor').value) === 0xffffff,
		'applied identity updates shared settings');
	player.network.players[0].color = 0xabcdef;
	player.networkState('lobby');
	check(Number(lobby.color.value) === 0xabcdef &&
			lobby.color.selectedOptions[0].textContent.includes(
				'#ABCDEF'),
		'custom command colors remain selectable in the driver form');
	for (const id of ['name-color-swatch', 'lobby-color-swatch'])
		check(getComputedStyle(document.getElementById(id))
					.backgroundColor ===
				'rgb(171, 205, 239)',
			'shared color styles display the selected driver color in ' +
				id);

	lobby.car.value = '2';
	lobby.car.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(player.getMultiplayer().players[0].car === 'Zeta' &&
			setup.input('car').value === '2',
		'connected car selector updates the player profile and shared selection');
	player.deniedCar = 'Alpha';
	lobby.car.value = '1';
	lobby.car.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(lobby.car.value === '2' &&
			byId('lobby-command-output')
				.textContent.includes('Can\'t find car'),
		'car restrictions return a local notice and preserve the connected selection');
	player.deniedCar = '';
	check([...lobby.car.options].some((option) => option.value === '3'),
		'server-allowed cars are selectable before using a command, even when locked in solo');
	player.networkState('lobby', {cars: [2]});
	check(lobby.car.options.length === 1 && lobby.car.value === '2',
		'server car restrictions replace solo availability');
	player.networkState('lobby', {cars: [1]});
	check(lobby.car.value === '2' && lobby.car.selectedOptions[0].disabled,
		'a restricted current car remains visible without being offered as a new choice');
	player.networkState('lobby', {cars: [1, 2, 3]});
	lobby.command('/car Locked');
	check(lobby.car.value === '3' && setup.input('car').value === '2' &&
			setup.input('car').options.length === 2,
		'network car commands can select a server-allowed car without unlocking solo choices');
	lobby.command('/car Zeta');
	player.commandFailure = 'Car unavailable';
	lobby.car.value = '1';
	lobby.car.dispatchEvent(new Event('change'));
	await Promise.resolve();
	check(lobby.car.value === '2' &&
			lobby.status.textContent === 'Car unavailable',
		'rejected car change restores the connected selection and explains failure');
	check(meterValues(lobby.controls.root) === '0.7,0.5,0.3',
		'rejected car changes keep the confirmed car ratings');
	player.commandFailure = '';
	byId('lobby-commands').click();
	check(byId('lobby-command-output').textContent.includes('/team') &&
			!byId('lobby-command-output').hidden,
		'command help is visible through the public chat API');
	byId('lobby-server-commands').click();
	check(player.network.chat.at(-1).text === '/helpserver',
		'server help reaches the server');
	lobby.chatInput.value = '/name NewName';
	lobby.sendChat();
	check(lobby.driverName.value === 'NewName' &&
			setup.input('name').value === 'NewName' &&
			byId('lobby-players').textContent.includes('NewName'),
		'profile commands update the roster and shared driver identity');
	player.network.chat = [];
	byId('lobby-ready').click();
	check(byId('lobby-ready-label').textContent === 'Not ready' &&
			byId('lobby-ready')
					.querySelector('[aria-hidden="true"]')
					.textContent.trim() === '↗',
		'ready state offers only the opposite action');
	check(byId('lobby-players')
					.querySelector(
						'.local .lobby-player-state')
					.textContent === 'Ready' &&
			byId('lobby-ready').getAttribute('aria-pressed') ===
				'true',
		'readiness follows confirmed roster state');
	byId('lobby-ready').click();
	check(!player.network.players[0].ready,
		'not-ready button uses public command');
	check(byId('lobby-ready-label').textContent === 'Ready' &&
			!byId('lobby-not-ready'),
		'not-ready state has a single readiness action');
	player.network.players[0].passing = true;
	player.networkState('lobby');
	byId('lobby-ready').click();
	check(player.network.players[0].ready &&
			!player.network.players[0].passing,
		'one Ready click returns a sitting-out player to ready');
	lobby.chatInput.value = '<b>hello</b>';
	lobby.sendChat();
	check(byId('lobby-chat-log').textContent === '<b>hello</b>' &&
			!byId('lobby-chat-log').querySelector('b'),
		'chat displays literal text safely');
	player.networkState('loading');
	check(track.disabled && laps.disabled && mode.disabled,
		'race setting dropdowns are disabled outside the lobby');
	check(lobby.driverName.matches(':disabled') &&
			lobby.applyProfile.matches(':disabled'),
		'race loading locks all driver edits');
	check(lobby.car.matches(':disabled'),
		'car selection locks when the race starts');
	check(!setup.form.hidden && !canvas.hidden && setup.actions.hidden &&
			setup.view.dialog.open,
		'network loading opens the canvas');
	player.networkState('racing');
	check(setup.pause.hidden && setup.restartButton.hidden &&
			setup.leave.textContent === 'Return to lobby',
		'online race offers return without local pause or restart');
	canvas.dispatchEvent(new KeyboardEvent(
		'keydown', {key: 'Escape', bubbles: true, cancelable: true}));
	check(!player.paused && document.activeElement === setup.leave &&
			player.state === 'racing',
		'Escape exposes online return action without pausing or retiring');
	const onlineFullscreen = setup.view.isFullscreen;
	setup.view.isFullscreen = () => true;
	const onlinePause = new KeyboardEvent(
		'keydown', {key: 'p', bubbles: true, cancelable: true});
	canvas.dispatchEvent(onlinePause);
	check(!onlinePause.defaultPrevented && !player.paused,
		'P does not pause online races or consume their game bindings');
	setup.view.isFullscreen = onlineFullscreen;
	const previousHistory = player.history.length;
	await player.leaveRace();
	check(setup.resultView.dialog.open &&
			document.getElementById('summary-result-rows')
				.textContent.includes('34.567 s'),
		'network return shows server results in the same floating frame');
	document.getElementById('close-results').click();
	check(!lobby.panel.hidden && !setup.form.hidden && canvas.hidden &&
			document.activeElement === byId('multiplayer-tab'),
		'return restores lobby and keyboard focus');
	check(player.history.length === previousHistory &&
			byId('lobby-result-rows')
				.textContent.includes('34.567 s'),
		'network results use server statistics without changing solo history');
	setup.selectTab('settings-panel');
	const showFPS = setup.input('showFPS');
	check(!showFPS.matches(':disabled'),
		'FPS checkbox is editable after returning to the connected lobby');
	showFPS.click();
	await Promise.resolve();
	check(showFPS.checked && player.network.showFPS &&
			player.state === 'lobby',
		'FPS changes apply without leaving the server');
	player.networkState('lobby');
	check(!showFPS.matches(':disabled') && showFPS.checked,
		'roster refreshes preserve the editable FPS preference');
	player.fpsFailure = 'Display preference unavailable';
	showFPS.click();
	await Promise.resolve();
	check(showFPS.checked &&
			setup.message.textContent === player.fpsFailure,
		'failed FPS updates restore the actual preference');
	player.fpsFailure = '';
	showFPS.click();
	await Promise.resolve();
	check(!showFPS.checked && !player.network.showFPS,
		'FPS display can be turned off again');
	const savedGear = !setup.input('automatic').checked;
	player.settings.automatic = savedGear;
	setup.selectTab('settings-panel');
	check(setup.navigationNotice.open, 'explanation can be reopened');
	await player.leaveServer();
	check(setup.input('automatic').checked === savedGear,
		'disconnect refreshes local preferences from the runtime before another race');
	check(!setup.input('name').disabled && !setup.input('car').disabled &&
			!lobby.active(),
		'disconnect restores editable settings');
	check(!byId('lobby-connection').hidden,
		'join section returns after disconnect');
	check(lobby.car.options.length === 2 && lobby.car.value === '2',
		'disconnect removes network-only car choices');
	check(!byId('settings-tab').hasAttribute('aria-disabled') &&
			!setup.navigationNotice.open,
		'disconnect restores navigation and clears its explanation');
	byId('settings-tab').click();
	check(!byId('settings-panel').hidden && location.hash === '#settings',
		'tab clicks work again after disconnect');
	setup.selectTab('multiplayer-panel');
	check(lobby.driver.hidden, 'disconnect hides the driver section again');
	check(!setup.input('showPlayerNames').checked &&
			!setup.input('showPlayerNames').disabled,
		'leaving multiplayer restores the saved nameplate preference');
	setup.input('showPlayerNames').checked = true;
	check(setup.configuration().graphics.showPlayerNames === true,
		'player names can be enabled again');
	player.joinFailure = 'Invalid connection settings';
	await lobby.join();
	check(lobby.status.textContent === player.joinFailure &&
			!lobby.active(),
		'immediate connection failure remains visible and releases settings');
	check(!byId('lobby-connection').hidden,
		'join section returns after connection failure');
	player.joinFailure = '';
	player.deferJoin = true;
	const pendingJoin = lobby.join();
	check(lobby.driver.hidden,
		'pending connections keep the driver section hidden');
	check(byId('settings-tab').getAttribute('aria-disabled') === 'true',
		'pending connections restrict navigation until cancellation');
	check(byId('leave-server').textContent === 'Cancel connection',
		'pending connection offers cancellation');
	await player.leaveServer();
	await pendingJoin;
	check(!lobby.active() && !setup.input('name').disabled,
		'cancelled connection restores settings');
	player.deferJoin = false;
	await lobby.join();
	player.emit('error', new Error('Server lost'));
	player.networkState('failed', {error: 'Server lost'});
	check(!byId('settings-tab').hasAttribute('aria-disabled'),
		'lost connections release the navigation restriction');
	check(!lobby.panel.hidden &&
			lobby.status.textContent === 'Server lost' &&
			!setup.input('name').disabled,
		'connection failure stays in lobby with the server error');
	player.networkState('offline', {available: false});
	check(byId('lobby-connection').disabled &&
			lobby.status.textContent.includes('unavailable'),
		'runtime without multiplayer disables connection controls');
	setup.selectTab('race-panel');
	await setup.start();
	check(player.state === 'racing' && !setup.pause.hidden &&
			!setup.restartButton.hidden,
		'single-player still works after multiplayer disconnects');
	player.failure = 'Restart failed';
	await setup.start(true);
	check(!setup.starting && !setup.restarting && !setup.leave.disabled &&
			setup.restartButton.hidden && !setup.view.dialog.open &&
			setup.message.textContent === 'Restart failed',
		'failed restart restores setup and releases action locks');
	player.failure = '';
	await setup.start();
	check(player.state === 'racing' && !setup.restartButton.hidden,
		'a new race can start after a failed restart');
	await fetch('/report',
		{method: 'POST', body: JSON.stringify({passed: true, checks})});
}

run().catch((error) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify({passed: false, checks, error: error.stack})
}));
