'use strict';

// Presentation only: the public player API owns connection and race state.
class OpenMHLobby {
	constructor(setup, connection = {}) {
		this.setup = setup;
		this.player = setup.player;
		this.connection = connection;
		this.panel = document.getElementById('multiplayer-panel');
		this.controls = new OpenMHRaceConfiguration(this.player,
			document.getElementById('lobby-configuration'),
			setup.lapRange,
			{multiplayer: true});
		this.status = document.getElementById('lobby-status');
		this.url = document.getElementById('server-url');
		this.password = document.getElementById('server-password');
		this.chatInput = document.getElementById('lobby-chat-input');
		this.disabled = new Map();
		this.url.value = connection.url || '';
		document.getElementById('join-server')
			.addEventListener('click', () => this.join());
		document.getElementById('leave-server')
			.addEventListener('click',
				() => this.perform(
					() => this.player.leaveServer()));
		this.bindCar();
		this.bindProfile();
		this.bindRaceSettings();
		this.bindShowFPS();
		for (const [id, command] of [['lobby-commands', '/help'],
			     ['lobby-server-commands', '/helpserver']])
			document.getElementById(id).addEventListener('click',
				() => this.perform(
					() => this.command(command)));
		document.getElementById('lobby-ready')
			.addEventListener('click',
				() => this.perform(() => this.toggleReady()));
		document.getElementById('lobby-chat-send')
			.addEventListener('click', () => this.sendChat());
		this.chatInput.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter')
				return;
			event.preventDefault();
			this.sendChat();
		});
		this.player.on('multiplayer', (view) => this.update(view));
		this.update(this.player.getMultiplayer());
	}

	bindRaceSettings() {
		this.track = document.getElementById('lobby-track-select');
		this.laps = document.getElementById('lobby-laps');
		this.mode = document.getElementById('lobby-mode');
		// Multiplayer availability is decided by the server, not solo unlocks.
		const names = [...new Set(
			this.setup.content.tracks.map((track) => track.name))];
		names.sort((a, b) => a.localeCompare(
				   b, 'en', {sensitivity: 'base'}));
		for (const name of names)
			this.track.add(new Option(name, name));
		for (const [id, name] of ['Normal', 'Elimination'].entries())
			this.mode.add(new Option(name, String(id)));
		for (const [input, field] of [[this.track, 'track'],
			     [this.laps, 'laps'],
			     [this.mode, 'mode']])
			input.addEventListener('change',
				() => this.changeRaceSetting(input, field));
	}

	changeRaceSetting(input, field) {
		if (this.view.state !== 'lobby')
			return;
		this.perform(() => {
			try {
				const current =
					this.player.getMultiplayer()[field];
				if (input.value.toLowerCase() ===
					String(current).toLowerCase())
					return;
				// /mode toggles between the two multiplayer modes.
				const command = field === 'mode'
					? '/mode'
					: `/${field} ${input.value}`;
				this.command(command);
			} finally {
				this.syncRaceSettings(
					this.player.getMultiplayer());
			}
		});
	}

	syncRaceSettings(view) {
		for (const option of [...this.track.options])
			if (option.dataset.network)
				option.remove();
		let selected = [...this.track.options].find(
			(option) => option.value.toLowerCase() ===
				view.track.toLowerCase());
		if (!selected && view.track) {
			selected = new Option(view.track, view.track);
			selected.dataset.network = '1';
			this.track.add(selected);
		}
		this.track.value = selected?.value || '';
		this.laps.value = view.laps;
		this.mode.value = view.mode;
		const name = view.track.toLowerCase();
		if (this.previewTrack === name)
			return;
		this.previewTrack = name;
		const track = this.setup.content.tracks.find(
			(item) => item.name.toLowerCase() === name);
		this.controls.showTrack(track);
	}

	bindShowFPS() {
		this.showFPS = this.setup.input('showFPS');
		this.showFPS.addEventListener('change', () => {
			if (!this.active())
				return;
			this.setup.perform(() => {
				try {
					this.player.setMultiplayerShowFPS(
						this.showFPS.checked);
					this.setup.message.textContent = '';
				} finally {
					this.showFPS.checked =
						this.player.getMultiplayer()
							.showFPS;
				}
			});
		});
	}

	bindCar() {
		const car = this.setup.input('car');
		this.car = document.getElementById('lobby-car');
		this.resetCars();
		this.car.addEventListener('change', () => this.changeCar());
		car.addEventListener('change', () => {
			this.car.value = car.value;
			this.showCar();
		});
	}

	resetCars() {
		const car = this.setup.input('car');
		this.car.replaceChildren(...[...car.options].map(
			(option) => option.cloneNode(true)));
		this.car.value = car.value;
		this.carChoices = '';
		this.showCar();
	}

	syncCars(view, local) {
		const ids = new Set(view.cars);
		const key = JSON.stringify([view.cars, local.car]);
		if (key === this.carChoices)
			return;
		this.carChoices = key;
		const choices = this.setup.content.cars.filter(
			(car) => ids.has(car.id));
		choices.sort((a, b) => a.name.localeCompare(
				     b.name, 'en', {sensitivity: 'base'}));
		this.car.replaceChildren(
			...choices.map((car) => new Option(car.name, car.id)));
		const selected = this.setup.content.cars.find(
			(car) => car.name.toLowerCase() ===
				local.car.toLowerCase());
		// Retain an existing selection if the server reduces its allowed catalog.
		if (selected && !ids.has(selected.id)) {
			const option = new Option(selected.name, selected.id);
			option.disabled = true;
			this.car.add(option);
		}
	}

	showCar() {
		this.controls.showCar(this.setup.content.cars.find(
			(car) => car.id === Number(this.car.value)));
	}

	changeCar() {
		const car = this.setup.input('car');
		if (!this.active()) {
			car.value = this.car.value;
			car.dispatchEvent(new Event('change'));
			return;
		}
		this.perform(() => {
			try {
				const id = Number(this.car.value);
				const selected = this.setup.content.cars.find(
					(choice) => choice.id === id);
				this.command('/car ' + selected.name);
			} finally {
				this.syncProfile(this.player.getMultiplayer());
			}
		});
	}

	bindProfile() {
		this.driver = document.getElementById('lobby-driver');
		this.driverName = document.getElementById('lobby-name');
		this.team = document.getElementById('lobby-team');
		this.color = document.getElementById('lobby-color');
		this.applyProfile =
			document.getElementById('lobby-apply-profile');
		this.applyProfile.addEventListener(
			'click', () => this.updateProfile());
		for (const [input, setting] of [[this.driverName, 'name'],
			     [this.team, 'team'],
			     [this.color, 'nameColor']]) {
			const shared = this.setup.input(setting);
			input.addEventListener('input', () => {
				if (this.active())
					this.profileDirty = true;
				else {
					shared.value = input.value;
					shared.dispatchEvent(
						new Event('change'));
				}
				this.showProfileColor();
			});
			input.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter' || !this.active())
					return;
				event.preventDefault();
				this.updateProfile();
			});
			shared.addEventListener('change', () => {
				if (!this.active() &&
					input.value !== shared.value)
					this.restoreProfile();
			});
		}
		this.restoreProfile();
	}

	restoreProfile() {
		this.driverName.value = this.setup.input('name').value;
		this.team.value = this.setup.input('team').value;
		const color = this.setup.input('nameColor');
		this.color.replaceChildren(...[...color.options].map(
			(option) => option.cloneNode(true)));
		this.color.value = color.value;
		this.profileDirty = false;
		this.showProfileColor();
	}

	showProfileColor() {
		this.controls.showColor(Number(this.color.value));
	}

	updateProfile() {
		if (this.view.state !== 'lobby')
			return;
		if (![this.driverName, this.team, this.color].every(
			    (input) => input.reportValidity()))
			return;
		this.perform(() => {
			this.player.setMultiplayerProfile({
				name: this.driverName.value,
				team: this.team.value,
				color: Number(this.color.value)
			});
			this.profileDirty = false;
			this.syncProfile(this.player.getMultiplayer());
			this.status.textContent = '';
		});
	}

	syncProfile(view) {
		const local = view.players.find((player) => player.local);
		if (!local)
			return;
		this.syncCars(view, local);
		this.setup.input('name').value = local.name;
		this.setup.input('team').value = local.team || '';
		if (Number(this.setup.input('nameColor').value) !== local.color)
			this.setup.populateNameColors(local.color);
		if (!this.profileDirty &&
			(this.driverName.value !== local.name ||
				this.team.value !== (local.team || '') ||
				Number(this.color.value) !== local.color))
			this.restoreProfile();
		const name = local.car.toLowerCase();
		const selected = this.setup.content.cars.find(
			(choice) => choice.name.toLowerCase() === name);
		if (!selected)
			return;
		const value = String(selected.id);
		const car = this.setup.input('car');
		if (selected.available && car.value !== value) {
			car.value = value;
			car.dispatchEvent(new Event('change'));
		}
		this.car.value = value;
		this.showCar();
	}

	command(text) {
		const messages = this.player.sendChat(text);
		const output = document.getElementById('lobby-command-output');
		output.textContent = messages.join('\n');
		output.hidden = messages.length === 0;
		this.syncProfile(this.player.getMultiplayer());
		if (messages.length)
			document.getElementById('lobby-console').scrollTop =
				output.offsetTop;
	}

	toggleReady() {
		if (this.view.state !== 'lobby')
			return;
		this.player.toggleMultiplayerReady();
	}

	active() {
		return (this.joining ||
			(this.view &&
				!['offline', 'failed'].includes(
					this.view.state)));
	}

	lockSettings(locked) {
		this.setup.navigation.restrictTo(
			locked ? 'multiplayer-panel' : null);
		if (!locked)
			this.setup.navigationNotice.close();
		if (locked && !this.disabled.size) {
			for (const input of this.setup.form.elements) {
				if (this.panel.contains(input) ||
					input.tagName === 'FIELDSET' ||
					input.getAttribute('role') === 'tab')
					continue;
				this.disabled.set(input, input.disabled);
				input.disabled = true;
			}
		} else if (!locked) {
			for (const [input, disabled] of this.disabled)
				input.disabled = disabled;
			this.disabled.clear();
		}
	}

	async join() {
		if (this.active())
			return;
		if (this.setup.busy()) {
			this.status.textContent =
				'Wait for the save operation to finish.';
			return;
		}
		if (!this.setup.form.reportValidity())
			return;
		if (!this.url.value.trim()) {
			this.status.textContent = 'Enter a server address.';
			this.url.focus();
			return;
		}
		let failure;
		this.joining = true;
		try {
			this.setup.keyboardSettings.apply();
			this.status.textContent = 'Connecting…';
			this.lockSettings(true);
			document.getElementById('lobby-connection').disabled =
				true;
			document.getElementById('lobby-connection').hidden =
				true;
			this.driver.disabled = true;
			this.driver.hidden = true;
			document.getElementById('lobby-command-output').hidden =
				true;
			document.getElementById('lobby-connected').hidden =
				false;
			document.getElementById('lobby-actions').hidden = false;
			document.getElementById('leave-server').textContent =
				'Cancel connection';
			document.getElementById('leave-server').disabled = true;
			const joining = this.player.joinServer({
				...this.connection,
				url: this.url.value.trim(),
				password: this.password.value,
				settings: this.setup.configuration()
			});
			this.password.value = '';
			await joining;
		} catch (error) {
			failure = error.message;
		} finally {
			this.joining = false;
			this.update(this.player.getMultiplayer());
			if (failure)
				this.status.textContent = failure;
		}
	}

	async perform(operation) {
		try {
			await operation();
			if (this.view.state === 'lobby')
				this.status.textContent = '';
		} catch (error) {
			this.status.textContent = error.message;
		}
	}

	sendChat() {
		this.perform(() => {
			this.command(this.chatInput.value);
			this.chatInput.value = '';
			this.chatInput.focus();
		});
	}

	renderPlayers(view) {
		const rows = document.getElementById('lobby-players');
		rows.replaceChildren();
		for (const player of view.players) {
			const state = player.racing ? 'Racing'
				: player.ready	    ? 'Ready'
				: player.passing    ? 'Sitting out'
						    : 'Not ready';
			const row = document.createElement('li');
			row.classList.toggle('local', !!player.local);
			row.style.setProperty('--driver-color',
				OpenMHRaceConfiguration.colorHex(player.color));
			const heading = document.createElement('div');
			heading.className = 'lobby-player-heading';
			const name = document.createElement('strong');
			name.textContent =
				player.name + (player.local ? ' (you)' : '');
			const badge = document.createElement('span');
			badge.className = 'lobby-player-state';
			badge.classList.toggle('ready', !!player.ready);
			badge.textContent = state;
			heading.append(name, badge);
			const details = document.createElement('p');
			details.className = 'lobby-player-details';
			details.textContent = [
				player.team,
				player.car,
				`${player.points} pts`
			].filter(Boolean).join(' · ');
			row.append(heading, details);
			rows.append(row);
		}
		const local = view.players.find((player) => player.local);
		const ready = document.getElementById('lobby-ready');
		document.getElementById('lobby-ready-label').textContent =
			local?.ready ? 'Not ready' : 'Ready';
		ready.classList.toggle('primary', !local?.ready);
		ready.disabled = view.state !== 'lobby' || !local;
		ready.setAttribute('aria-pressed', String(!!local?.ready));
	}

	renderChat(view) {
		const key = JSON.stringify([
			view.chatRevision,
			view.chat,
			view.noticeRevision,
			view.notice
		]);
		if (key === this.lastChat)
			return;
		this.lastChat = key;
		const console = document.getElementById('lobby-console');
		const following = console.scrollHeight - console.scrollTop -
				console.clientHeight <
			24;
		const log = document.getElementById('lobby-chat-log');
		log.replaceChildren();
		for (const message of view.chat) {
			const line = document.createElement('li');
			line.textContent = message.text;
			log.append(line);
		}
		document.getElementById('lobby-notice').textContent =
			view.notice ? 'Server: ' + view.notice : '';
		if (following)
			console.scrollTop = console.scrollHeight;
	}

	renderResults(view) {
		const body = document.getElementById('lobby-result-rows');
		body.replaceChildren();
		document.getElementById('lobby-results').hidden =
			!view.statistics.length;
		for (const result of view.statistics)
			body.append(OpenMHRaceResults.resultRow(
				OpenMHRaceResults.serverCells(result)));
	}

	async showLobby(showResults = false) {
		const setup = this.setup;
		setup.continueButton.hidden = true;
		setup.form.hidden = false;
		setup.showRaceActions(false);
		await setup.view.close();
		setup.pause.hidden = false;
		setup.leave.textContent = 'Leave race';
		setup.message.textContent = '';
		if (!['loading', 'racing'].includes(this.view.state)) {
			setup.selectTab('multiplayer-panel', true);
			if (showResults && this.view.state === 'lobby')
				setup.resultView.showSummary(
					this.view.statistics.map(
						(row) => OpenMHRaceResults
							.serverCells(row)));
		}
	}

	refreshPreferences(view) {
		if (['lobby', 'loading', 'racing'].includes(view.state))
			this.wasConnected = true;
		if (!this.wasConnected ||
			!['offline', 'failed'].includes(view.state))
			return;
		this.wasConnected = false;
		const settings = this.player.getSettings();
		this.setup.input('name').value = settings.player.name;
		this.setup.input('team').value = settings.player.team;
		this.setup.populateNameColors(settings.player.color);
		this.setup.input('automatic').checked = !!settings.automatic;
		this.setup.input('horn').value = settings.horn;
		// Multiplayer selections must not unlock cars in the solo form.
		const car = this.setup.input('car');
		if ([...car.options].some((option) => Number(option.value) ===
				    settings.car)) {
			car.value = settings.car;
			car.dispatchEvent(new Event('change'));
		}
	}

	updateControls(view) {
		const active = this.active();
		this.lockSettings(active);
		if (active) {
			this.showFPS.disabled = view.state !== 'lobby' ||
				typeof this.player.setMultiplayerShowFPS !==
					'function';
			if (view.state === 'lobby' &&
				typeof view.showFPS === 'boolean')
				this.showFPS.checked = view.showFPS;
		}
		this.driver.hidden =
			!['lobby', 'loading', 'racing'].includes(view.state);

		this.controls.root.hidden = this.driver.hidden;
		document.getElementById('lobby-connection').disabled =
			active || !view.available;
		document.getElementById('lobby-connection').hidden = active;
		document.getElementById('lobby-connected').hidden = !active;
		document.getElementById('lobby-actions').hidden = !active;
		this.driver.disabled =
			!view.available || (active && view.state !== 'lobby');
		this.car.disabled = this.driver.disabled;
		this.applyProfile.hidden = !active;
		if (active)
			this.syncProfile(view);
		else {
			this.resetCars();
			this.restoreProfile();
		}
		const leave = document.getElementById('leave-server');
		leave.disabled = view.state === 'leaving';
		leave.textContent = view.state === 'connecting'
			? 'Cancel connection'
			: 'Leave server';
		const inLobby = view.state === 'lobby';
		for (const id of ['lobby-chat-send',
			     'lobby-chat-input',
			     'lobby-commands',
			     'lobby-server-commands',
			     'lobby-track-select',
			     'lobby-laps',
			     'lobby-mode'])
			document.getElementById(id).disabled = !inLobby;
	}

	updateStatus(view, previous) {
		if (!view.available)
			this.status.textContent =
				'Multiplayer is unavailable in this game version or browser.';
		else if (view.state === 'failed')
			this.status.textContent = view.error;
		else if (view.state === 'connecting')
			this.status.textContent = 'Connecting…';
		else if (view.state === 'leaving')
			this.status.textContent = 'Leaving server…';
		else if (view.state === 'lobby' && previous !== 'lobby')
			this.status.textContent = '';
		else if (view.state === 'offline' && previous !== undefined &&
			previous !== 'offline')
			this.status.textContent = '';
	}

	updateRaceView(view, previous) {
		if (view.state === previous)
			return;
		this.setup.resultView.closeSummary();
		if (view.state === 'loading') {
			this.setup.form.hidden = false;
			this.setup.view.open(
				this.setup.configuration().graphics);
			this.setup.showRaceActions(false);
			this.setup.message.textContent =
				'Loading network race…';
		} else if (view.state === 'racing') {
			this.setup.form.hidden = false;
			this.setup.view.open(
				this.setup.configuration().graphics);
			this.setup.showRaceActions(true, true);
			this.setup.pause.hidden = true;
			this.setup.leave.textContent = 'Return to lobby';
			this.setup.message.textContent = '';
			this.setup.showRaceView();
		} else if (previous !== undefined && view.state !== 'leaving')
			this.showLobby(previous === 'racing');
	}

	update(view) {
		const previous = this.view?.state;
		this.view = view;
		this.refreshPreferences(view);
		this.updateControls(view);
		this.updateStatus(view, previous);
		document.getElementById('lobby-track').hidden = !view.track;
		this.syncRaceSettings(view);
		this.renderPlayers(view);
		this.renderChat(view);
		this.renderResults(view);
		this.updateRaceView(view, previous);
	}
}
