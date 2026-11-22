'use strict';

// Shared controls and previews; callers own solo settings and server commands.
class OpenMHRaceConfiguration {
	constructor(player, root, lapRange, {multiplayer = false} = {}) {
		this.player = player;
		this.root = root;
		this.car = null;
		const content =
			document.getElementById('race-configuration-template')
				.content.cloneNode(true);
		for (const node of content.querySelectorAll(multiplayer
				     ? '[data-solo]'
				     : '[data-multiplayer]'))
			node.remove();
		if (multiplayer)
			this.identifyMultiplayer(content);
		root.replaceChildren(content);
		const laps = root.querySelector(
			multiplayer ? '#lobby-laps' : '[name="laps"]');
		const {minimum, maximum, step} = lapRange;
		for (let count = minimum; count <= maximum; count += step)
			laps.add(new Option(String(count), String(count)));
	}

	identifyMultiplayer(content) {
		for (const node of content.querySelectorAll('[id]'))
			node.id = node.id === 'name-color-swatch'
				? 'lobby-color-swatch'
				: 'lobby-' + node.id;
		const names = {track: 'track-select', nameColor: 'color'};
		for (const input of content.querySelectorAll('[name]')) {
			input.id = 'lobby-' + (names[input.name] || input.name);
			input.removeAttribute('name');
		}
		content.querySelector('.track-card').id = 'lobby-track';
		content.querySelector('.driver-section').id = 'lobby-driver';
	}

	static colorHex(color) {
		return '#' +
			(color & 0xffffff)
				.toString(16)
				.padStart(6, '0')
				.toUpperCase();
	}

	showColor(value) {
		const color = OpenMHRaceConfiguration.colorHex(value);
		const swatch = this.root.querySelector('.name-color-swatch');
		swatch.style.setProperty('--driver-color', color);
		swatch.title = color;
	}

	showTrack(track) {
		const canvas = this.root.querySelector('.track-map');
		const status = this.root.querySelector('.track-map-status');
		const details = this.root.querySelector('.track-details');
		canvas.hidden = true;
		details.textContent =
			[track?.location, track?.length].filter(Boolean).join(
				' · ');
		try {
			const map = track && this.player.getTrackMap(track.id);
			status.textContent =
				map ? '' : 'Track map unavailable.';
			if (!map)
				return;
			canvas.width = map.width;
			canvas.height = map.height;
			canvas.setAttribute(
				'aria-label', track.name + ' track layout');
			canvas.getContext('2d').putImageData(map, 0, 0);
			canvas.hidden = false;
		} catch {
			status.textContent = 'Track map unavailable.';
		}
	}

	showCar(car) {
		if (this.car === car)
			return;
		this.car = car;
		const details = this.root.querySelector('.car-details');
		details.replaceChildren();
		if (!car?.ratings) {
			details.textContent = 'Car ratings unavailable.';
			return;
		}
		for (const [key, name] of [['speed', 'Top speed'],
			     ['acceleration', 'Acceleration'],
			     ['handling', 'Handling']]) {
			const label = document.createElement('label');
			label.textContent = name;
			const meter = document.createElement('meter');
			meter.min = 0;
			meter.max = 1;
			meter.value = car.ratings[key];
			meter.textContent =
				Math.round(car.ratings[key] * 100) + '%';
			label.append(meter);
			details.append(label);
		}
	}
}
