'use strict';

// Deliberately exposes no Wasm module, filesystem or lifecycle internals.
class TestPlayer extends EventTarget {
	state = 'ready';
	paused = false;
	history = [];
	bindings = {};
	network = {
		available: true,
		state: 'offline',
		players: [],
		cars: [],
		chat: [],
		chatRevision: 0,
		track: '',
		laps: 0,
		mode: 0,
		showFPS: false,
		notice: '',
		statistics: [],
		error: ''
	};

	getMultiplayer() {
		return structuredClone(this.network);
	}

	networkState(state, fields = {}) {
		Object.assign(this.network, fields, {state});
		this.state = state === 'offline' ? 'ready' : state;
		this.emit('multiplayer', this.getMultiplayer());
	}

	async joinServer(options) {
		if (this.joinFailure)
			throw new Error(this.joinFailure);
		this.connection = structuredClone(options);
		this.settings = structuredClone(options.settings);
		this.networkState('connecting');
		if (this.deferJoin)
			await new Promise((resolve, reject) => {
				this.cancelJoin = reject;
			});
		this.networkState('lobby', {
			track: 'Synthetic course',
			cars: [1, 2, 3],
			showFPS: options.settings.graphics.showFPS,
			laps: 3,
			players: [
				{
					id: 1,
					local: true,
					name: options.settings.player.name,
					team: options.settings.player.team,
					color: options.settings.player.color,
					car: this.getContent()
						.cars
						.find((car) => car.id ===
								options.settings
									.car)
						.name,
					points: 7
				},
				{
					id: 2,
					name: '<img src=x onerror=alert(1)>',
					car: 'Alpha',
					points: 3
				}
			]
		});
	}

	async leaveServer() {
		const local =
			this.network.players.find((player) => player.local);
		if (local) {
			this.settings.player = {
				name: local.name,
				team: local.team,
				color: local.color
			};
			this.settings.car =
				this.getContent()
					.cars
					.find((car) => car.name === local.car)
					.id;
		}
		this.networkState('leaving');
		this.cancelJoin?.(new Error('Connection cancelled.'));
		this.cancelJoin = null;
		this.networkState(
			'offline', {players: [], chat: [], statistics: []});
	}

	toggleMultiplayerReady() {
		const local = this.network.players[0];
		local.ready = !local.ready;
		local.passing = false;
		this.networkState('lobby');
	}

	setMultiplayerShowFPS(enabled) {
		if (this.fpsFailure)
			throw new Error(this.fpsFailure);
		if (this.network.state !== 'lobby')
			throw new Error('Not in lobby');
		this.networkState('lobby', {showFPS: enabled});
	}

	setMultiplayerProfile(profile) {
		if (this.profileFailure)
			throw new Error(this.profileFailure);
		Object.assign(this.network.players[0], profile);
		this.networkState('lobby');
	}

	sendChat(text) {
		if (this.commandFailure)
			throw new Error(this.commandFailure);
		if (text.startsWith('/track ')) {
			this.trackCommand = text;
			if (this.deferTrack)
				return [];
			if (this.trackLocked) {
				this.network.chat.push({text: 'Track locked!'});
				this.network.chatRevision++;
			} else
				this.network.track = text.slice(7);
			this.networkState('lobby');
			return [];
		}
		if (text === '/mode') {
			this.modeCommands = (this.modeCommands || 0) + 1;
			if (this.deferMode)
				return [];
			if (this.modeLocked) {
				this.network.chat.push(
					{text: 'Gamemode locked!'});
				this.network.chatRevision++;
			} else
				this.network.mode =
					this.network.mode === 0 ? 1 : 0;
			this.networkState('lobby');
			return [];
		}
		if (text.startsWith('/laps ')) {
			this.lapsCommand = text;
			if (this.deferLaps)
				return [];
			if (this.lapsLocked) {
				this.network.chat.push({text: 'Laps locked!'});
				this.network.chatRevision++;
			} else
				this.network.laps = Number(text.slice(6));
			this.networkState('lobby');
			return [];
		}
		if (text === '/help')
			return ['/name <name>', '/team <team>', '/car <car>'];
		if (text === '/car ' + this.deniedCar)
			return ['Can\'t find car: ' + this.deniedCar];
		if (text.startsWith('/car ')) {
			this.network.players[0].car = text.slice(5);
			this.networkState('lobby');
			return ['Car changed to: ' + text.slice(5)];
		}
		if (text.startsWith('/name ')) {
			this.network.players[0].name = text.slice(6);
			this.networkState('lobby');
			return ['Name changed to: ' + text.slice(6)];
		}
		this.network.chat.push({text});
		this.network.chatRevision++;
		this.networkState('lobby');
		return [];
	}

	async returnToLobby() {
		this.emit('finished', []);
		this.networkState('lobby', {
			statistics: [{
				position: 1,
				name: 'UI Racer',
				milliseconds: 34567,
				bestLap: 12345
			}]
		});
	}

	on(name, callback) {
		this.addEventListener(name, (event) => callback(event.detail));
	}

	emit(name, detail) {
		this.dispatchEvent(new CustomEvent(name, {detail}));
	}

	getContent() {
		const choice = (id, name, extra = {}) =>
			({id, name, available: true, ...extra});
		return {
			nameColors: [0x123456],
			cars: [
				choice(2, 'Zeta', {
					ratings: {
						speed: 0.7,
						acceleration: 0.5,
						handling: 0.3
					}
				}),
				choice(1, 'Alpha', {
					ratings: {
						speed: 0.4,
						acceleration: 0.6,
						handling: 0.8
					}
				}),
				choice(3, 'Locked', {available: false})
			],
			tracks: [
				choice(7, 'Synthetic course', {
					musicTrack: 3,
					location: 'Test area',
					length: '1 km'
				}),
				choice(8, 'Night circuit', {available: false})
			],
			horns: [choice(0, 'Test horn')],
			modes: [
				choice(0, 'Quick Race'),
				choice(2, 'Time Attack')
			],
			controls: [choice(0, 'Keyboard')],
			music: [
				choice(2, 'First song'),
				choice(3, 'Second song')
			],
			renderers: [choice(4,
				'OpenMH',
				{resolutions: [{width: 640, height: 480}]})],
			audioProfiles: [choice(0, 'Software')]
		};
	}

	getPreferenceSchema() {
		return [{key: 'laps', minimum: 1, maximum: 13, step: 2}];
	}

	getSettings() {
		if (this.settings)
			return structuredClone(this.settings);
		return {
			player: {
				name: 'Fixture',
				team: 'TEST',
				color: 0x123456
			},
			car: 2,
			track: 7,
			horn: 0,
			mode: 0,
			laps: 1,
			difficulty: 0,
			automatic: true,
			catchUp: false,
			graphics: {
				renderer: 4,
				width: 640,
				height: 480,
				detail: 2,
				showFPS: false,
				showPlayerNames: true
			},
			sound: {effectsVolume: 80, musicVolume: 60, profile: 0}
		};
	}

	getControlBindings() {
		return {...this.bindings};
	}

	setControlBinding(profile, action, key) {
		this.bindings[action] = key;
	}

	getTrackMap(id) {
		this.mapLoads = (this.mapLoads || 0) + 1;
		if (id === this.brokenMap)
			throw new Error('Invalid map');
		return this.trackMaps?.get(id) || null;
	}

	getRaceHistory() {
		return {races: this.history, error: ''};
	}

	async waitUntilReady() {}

	async startRace(configuration) {
		if (this.failure)
			throw new Error(this.failure);
		this.starts = (this.starts || 0) + 1;
		this.configuration = structuredClone(configuration);
		this.state = 'racing';
		this.emit('loading', {percent: 100});
	}

	isPaused() {
		return this.paused;
	}

	pause() {
		this.paused = true;
		this.emit('pause', true);
	}

	resume() {
		this.paused = false;
		this.emit('pause', false);
	}

	async leaveRace() {
		if (this.network.state === 'racing')
			return this.returnToLobby();
		this.resume();
		this.state = 'ready';
		this.history = [{
			date: '2026-01-01T00:00:00Z',
			driver: this.configuration.player.name,
			track: 'Synthetic course',
			car: 'Alpha',
			mode: 'Quick Race',
			laps: 1,
			rows: [{
				position: 1,
				player: true,
				finished: true,
				milliseconds: 12345,
				bestLap: 12345
			}]
		}];
		this.emit('finished', this.history[0].rows);
	}
}
