'use strict';

// Page policy lives here: this launcher chooses OpenMH.
class OpenMHRaceSetup {
	// Display names for the original personal-menu palette, in authored order.
	static nameColorLabels = [
		'Light gray',
		'Gray',
		'Dark gray',
		'Almost black',
		'Cyan',
		'Blue',
		'Dark blue',
		'Navy',
		'Bright green',
		'Green',
		'Dark green',
		'Forest green',
		'Orange',
		'Red',
		'Dark red',
		'Maroon',
		'Yellow',
		'Gold',
		'Ochre',
		'Brown',
		'Light pink',
		'Pink',
		'Magenta',
		'Purple',
		'Turquoise',
		'Sea green',
		'Teal',
		'Dark teal',
		'Beige',
		'Tan',
		'Dark tan',
		'Dark brown'
	];

	constructor(player,
		canvas,
		busy = () => false,
		connection = {},
		view = new OpenMHRaceView(canvas)) {
		this.busy = busy;
		this.player = player;
		this.canvas = canvas;
		this.view = view;
		this.section = document.getElementById('race-setup');
		this.form = document.getElementById('race-form');
		this.actions = document.getElementById('race-actions');
		this.message = document.getElementById('race-message');
		this.results = document.getElementById('race-results');
		this.pause = document.getElementById('pause-race');
		this.restartButton = document.getElementById('restart-race');
		this.leave = document.getElementById('leave-race');
		this.continueButton = document.getElementById('continue-race');
		this.lapRange = player.getPreferenceSchema().find(
			field => field.key === 'laps');
		this.controls = new OpenMHRaceConfiguration(player,
			document.getElementById('solo-configuration'),
			this.lapRange);
		this.populate();
		this.resultView = new OpenMHRaceResults(player);
		this.bindTabs();
		this.lobby = new OpenMHLobby(this, connection);
		this.bindPageEvents();
		this.bindPlayerEvents();
		this.section.hidden = false;
		this.navigation.restore();
		this.view.close();
	}

	bindPageEvents() {
		this.input('nameColor')
			.addEventListener('change', () => this.showNameColor());
		this.input('track').addEventListener('change', () => {
			this.showTrack();
			this.populateMusic();
		});
		this.musicChoices = new Map();
		this.input('musicTrack').addEventListener('change', () => {
			this.musicChoices.set(Number(this.input('track').value),
				Number(this.input('musicTrack').value));
		});
		this.input('car').addEventListener(
			'change', () => this.showCar());
		this.form.addEventListener(
			'submit', (event) => this.submit(event));
		this.form.addEventListener('invalid',
			(event) => this.revealInvalidField(event.target),
			true);
		this.pause.addEventListener(
			'click', () => this.perform(() => this.togglePause()));
		this.restartButton.addEventListener(
			'click', () => this.start(true));
		this.leave.addEventListener('click',
			() => this.perform(() => this.player.leaveRace()));
		document.addEventListener(
			'keydown', (event) => this.raceKey(event), true);
		this.continueButton.addEventListener(
			'click', () => this.continueResults());
		this.canvas.addEventListener('click', () => {
			if (!this.continueButton.hidden)
				this.continueResults();
		});
	}

	raceKey(event) {
		if (this.navigationNotice.open)
			return;
		if (this.continueButton.hidden) {
			if (event.target === this.canvas ||
				this.view.isFullscreen())
				this.pauseKey(event);
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();
		// Holding the accelerator across the line must not dismiss the finish view.
		if (!event.repeat)
			this.continueResults();
	}

	async continueResults() {
		if (this.starting || this.continuing ||
			this.player.state !== 'racing')
			return;

		this.continuing = true;
		try {
			await this.perform(() => this.player.leaveRace());
		} finally {
			this.continuing = false;
		}
	}

	submit(event) {
		event.preventDefault();

		if (!this.lobby.panel.hidden) {
			if (!this.lobby.active())
				this.lobby.join();
			return;
		}
		if (document.getElementById('race-panel').hidden)
			this.selectTab('race-panel', true);
		else
			this.start();
	}

	togglePause() {
		if (this.player.isPaused())
			this.player.resume();
		else
			this.player.pause();
	}

	pauseKey(event) {
		const fullscreenPause = this.view.isFullscreen() &&
			!this.lobby.active() &&
			event.key.toUpperCase() ===
				OpenMHRaceView.shortcuts.fullscreenPause &&
			!event.ctrlKey && !event.altKey && !event.metaKey;
		if ((event.key !== 'Escape' && !fullscreenPause) ||
			this.player.state !== 'racing')
			return;

		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.repeat)
			return;
		if (this.lobby.active()) {
			this.message.textContent =
				'Online races cannot be paused. Choose Return to lobby to leave the race.';
			this.leave.focus();
		} else
			this.pause.click();
	}

	bindTabs() {
		this.navigationNotice =
			document.getElementById('navigation-notice');
		this.navigation = new OpenMHTabs(
			this.form.querySelector('[role="tablist"]'), {
				onBlocked: () => {
					if (!this.navigationNotice.open)
						this.navigationNotice
							.showModal();
				}
			});
	}

	selectTab(panel, focus = false) {
		this.navigation.select(panel, focus);
	}

	revealInvalidField(field) {
		const first = [...this.form.elements].find(
			(input) => input.willValidate && !input.validity.valid);
		// Keep the first invalid field visible when multiple tabs contain errors.
		if (field === first)
			this.selectTab(field.closest('[role="tabpanel"]').id);
	}

	bindPlayerEvents() {
		const player = this.player;
		player.on('pause', (paused) => {
			this.pause.textContent = paused ? 'Resume' : 'Pause';
		});
		player.on('finished', (rows) => {
			if (!this.lobby.active())
				this.finished(rows);
		});
		player.on('finishline', () => {
			if (!this.starting)
				this.continueButton.hidden = false;
		});
		player.on('error', (error) => {
			if (!this.lobby.active())
				this.failed(error);
		});
		player.on('loading', (progress) => {
			this.message.textContent =
				progress.percent === 100 ? '' : 'Loading race…';
		});
	}

	input(name) {
		return this.form.elements.namedItem(name);
	}

	choices(name, entries, selected) {
		const select = this.input(name);
		select.replaceChildren();
		for (const entry of entries) {
			if (!entry.available)
				continue;
			select.add(new Option(entry.name,
				entry.id,
				false,
				entry.id === selected));
		}
	}

	populate() {
		this.content = this.player.getContent();
		const settings = this.player.getSettings();

		this.populateChoices(settings);
		this.populateKeyboard();
		this.renderer = this.selectRenderer(settings.graphics.renderer);
		this.populateSettings(settings);
		this.populateMusic();
		this.showTrack();
		this.showCar();
	}

	populateChoices(settings) {
		for (const [field, list] of [['car', 'cars'],
			     ['track', 'tracks'],
			     ['horn', 'horns']]) {
			const sorted = [...this.content[list]].sort(
				(a, b) => a.name.localeCompare(
					b.name, 'en', {sensitivity: 'base'}));
			this.choices(field, sorted, settings[field]);
		}
		this.choices('mode', this.content.modes, settings.mode);
	}

	populateMusic() {
		const id = Number(this.input('track').value);
		const saved = this.musicChoices?.get(id) ??
			this.content.tracks.find((track) => track.id === id)
				?.musicTrack;
		const entries =
			this.content.music.filter((item) => item.available);
		const selected =
			entries.some((item) => item.id === saved) ? saved : 0;
		if (!selected)
			entries.unshift({
				id: 0,
				available: true,
				name: entries.length
					? 'Course default (unavailable)'
					: 'No music available'
			});
		this.choices('musicTrack', entries, selected);
		const select = this.input('musicTrack');
		select.disabled =
			!this.content.music.some((item) => item.available);
		select.closest('label').hidden = select.disabled;
	}

	populateKeyboard() {
		this.keyboard =
			this.content.controls.find((item) => item.available &&
					item.name.toLowerCase() === 'keyboard');
		if (!this.keyboard)
			throw new Error(
				'This package has no Keyboard control profile.');
		this.keyboardSettings = new OpenMHKeyboardSettings(this.player,
			this.keyboard.id,
			document.getElementById('keyboard-bindings'));
	}

	selectRenderer(saved) {
		const available =
			this.content.renderers.filter((item) => item.available);
		return (available.find((item) => item.name.toLowerCase() ===
					'openmh') ||
			available.find((item) => item.id === saved) ||
			available[0]);
	}

	populateSettings(settings) {
		this.input('name').value = settings.player.name;
		this.input('team').value = settings.player.team;
		this.populateNameColors(settings.player.color);
		for (const name of ['laps', 'difficulty'])
			this.input(name).value = settings[name];
		this.input('automatic').checked = !!settings.automatic;
		this.input('catchUp').checked = !!settings.catchUp;
		this.input('showFPS').checked = !!settings.graphics.showFPS;
		this.input('showPlayerNames').checked =
			!!settings.graphics.showPlayerNames;
		this.input('detail').value = settings.graphics.detail;
		this.populateResolutions(settings.graphics);
		this.input('effectsVolume').value =
			settings.sound.effectsVolume;
		this.input('musicVolume').value = settings.sound.musicVolume;
		const audio = this.input('audioProfile');
		audio.replaceChildren();
		for (const profile of this.content.audioProfiles)
			if (profile.available)
				audio.add(new Option(profile.name, profile.id));
		audio.value = settings.sound.profile;
	}

	populateNameColors(saved) {
		const select = this.input('nameColor');
		select.replaceChildren();
		if (!this.content.nameColors.includes(0xffffff))
			select.add(new Option('White', 0xffffff));
		for (const [index, color] of this.content.nameColors
				.entries()) {
			const label = OpenMHRaceSetup.nameColorLabels[index] ||
				OpenMHRaceConfiguration.colorHex(color);
			select.add(new Option(label, color));
		}
		// A saved custom color must survive opening the form unchanged.
		if (saved !== 0xffffff &&
			!this.content.nameColors.includes(saved)) {
			const label = `Saved color (${
				OpenMHRaceConfiguration.colorHex(saved)})`;
			select.add(new Option(label, saved));
		}
		select.value = saved;
		this.showNameColor();
	}

	showNameColor() {
		this.controls.showColor(Number(this.input('nameColor').value));
	}

	populateResolutions(saved) {
		const select = this.input('resolution');
		select.replaceChildren();
		const modes = this.renderer.resolutions;
		const selected =
			modes.find((mode) => mode.width === saved.width &&
					mode.height === saved.height) ||
			modes.find((mode) => mode.width === 1280 &&
					mode.height === 1024) ||
			modes[0];
		for (const mode of modes)
			select.add(new Option(`${mode.width} × ${mode.height}`,
				`${mode.width}x${mode.height}`,
				false,
				mode === selected));
	}

	showTrack() {
		const track = this.content.tracks.find((item) => item.id ===
				Number(this.input('track').value));
		this.controls.showTrack(track);
	}

	showCar() {
		const car = this.content.cars.find(
			(item) => item.id === Number(this.input('car').value));
		this.controls.showCar(car);
	}

	configuration() {
		const number = (name) => Number(this.input(name).value);
		const [width, height] =
			this.input('resolution').value.split('x').map(Number);
		return {
			player: {
				name: this.input('name').value,
				team: this.input('team').value,
				color: number('nameColor')
			},
			car: number('car'),
			track: number('track'),
			mode: number('mode'),
			horn: number('horn'),
			laps: number('laps'),
			difficulty: number('difficulty'),
			controls: this.keyboard.id,
			automatic: this.input('automatic').checked,
			catchUp: this.input('catchUp').checked,
			graphics: {
				renderer: this.renderer.id,
				width,
				height,
				detail: number('detail'),
				showFPS: this.input('showFPS').checked,
				showPlayerNames:
					this.input('showPlayerNames').checked
			},
			sound: {
				effectsVolume: number('effectsVolume'),
				musicVolume: number('musicVolume'),
				musicTrack: number('musicTrack'),
				profile: number('audioProfile')
			}
		};
	}

	async start(restart = false) {
		if (this.lobby.active()) {
			this.selectTab('multiplayer-panel', true);
			return;
		}
		if (this.starting || this.continuing ||
			(restart && this.player.state !== 'racing'))
			return;
		if (this.busy()) {
			this.message.textContent =
				'Wait for the save operation to finish.';
			return;
		}
		const configuration =
			restart ? this.raceConfiguration : this.configuration();
		this.starting = true;
		this.restarting = restart;
		this.leave.disabled = true;
		this.continueButton.hidden = true;
		this.resultView.closeSummary();
		this.view.open(configuration.graphics);
		this.showRaceActions(false);
		this.message.textContent = 'Loading race…';
		try {
			// Let the browser paint the loading message before synchronous asset setup.
			await new Promise(
				(resolve) => requestAnimationFrame(
					() => setTimeout(resolve, 0)));
			if (restart)
				await this.player.leaveRace();
			await this.player.waitUntilReady();
			this.keyboardSettings.apply();
			await this.player.startRace(configuration);
			this.raceConfiguration = configuration;
			this.showRaceActions(true);
			this.pause.textContent = 'Pause';
			await new Promise(
				(resolve) => requestAnimationFrame(resolve));
			this.showRaceView();
		} catch (error) {
			this.failed(error);
		} finally {
			this.starting = false;
			this.restarting = false;
			this.leave.disabled = false;
		}
	}

	showRaceActions(visible, online = false) {
		this.actions.hidden = !visible;
		this.restartButton.hidden = !visible || online;
	}

	showRaceView() {
		if (this.canvas.hidden || this.actions.hidden)
			return;
		this.canvas.focus({preventScroll: true});
	}

	async perform(operation) {
		try {
			await operation();
		} catch (error) {
			this.message.textContent = error.message;
		}
	}

	async failed(error) {
		this.continueButton.hidden = true;
		this.message.textContent = error.message;
		this.form.hidden = false;
		this.showRaceActions(false);
		await this.view.close();
		this.selectTab('race-panel');
	}

	async finished(rows) {
		if (this.restarting)
			return;

		this.continueButton.hidden = true;
		this.form.hidden = false;
		this.showRaceActions(false);
		await this.view.close();
		this.message.textContent = '';
		this.resultView.refresh();
		this.resultView.showSummary(
			rows.map((row) => OpenMHRaceResults.resultCells(row)));
	}
}
