'use strict';

// Owns page presentation only; the player owns race and connection lifetimes.
class OpenMHRaceView {
	static shortcuts = {fullscreen: 'F11', fullscreenPause: 'P'};

	constructor(canvas) {
		this.canvas = canvas;
		this.dialog = document.getElementById('race-overlay');
		this.shell = document.getElementById('race-shell');
		this.notices = document.getElementById('race-notices');
		this.tools = document.querySelector('.session-tools');
		// One in-frame display for race progress, suspension and errors.
		// Return messages to the page when no race is open.
		this.homes = new Map();
		for (const node of [this.tools,
			     document.getElementById('race-message'),
			     document.getElementById('status'),
			     document.getElementById('error')]) {
			const marker = document.createComment('Race view home');
			node.before(marker);
			this.homes.set(node, marker);
		}
		document.addEventListener(
			'keydown', (event) => this.fullscreenKey(event), true);
		// Escape belongs to the game; closing the view must also leave the race.
		this.dialog.addEventListener(
			'cancel', (event) => event.preventDefault());
	}

	supportsFullscreen() {
		return (document.fullscreenEnabled &&
			typeof this.shell.requestFullscreen === 'function');
	}

	isFullscreen() {
		return !!document.fullscreenElement?.contains(this.canvas);
	}

	async toggleFullscreen() {
		if (!this.dialog.open || !this.supportsFullscreen())
			return;
		try {
			if (document.fullscreenElement)
				await document.exitFullscreen();
			else
				await this.shell.requestFullscreen();
			this.canvas.focus({preventScroll: true});
		} catch (reason) {
			document.getElementById('status').textContent =
				'Fullscreen is unavailable: ' + reason.message;
		}
	}

	fullscreenKey(event) {
		if (event.key !== OpenMHRaceView.shortcuts.fullscreen ||
			!this.dialog.open)
			return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (!event.repeat)
			this.toggleFullscreen();
	}

	open(graphics) {
		this.canvas.hidden = false;
		if (this.dialog.open)
			return;
		this.previousFocus = document.activeElement;
		for (const node of this.homes.keys()) {
			if (node === this.tools)
				this.shell.prepend(node);
			else
				this.notices.append(node);
		}
		if (graphics)
			this.dialog.style.setProperty('--race-aspect',
				graphics.width / graphics.height);
		this.dialog.showModal();
		this.canvas.focus({preventScroll: true});
	}

	async close() {
		if (this.isFullscreen())
			await document.exitFullscreen().catch(() => {});
		if (document.pointerLockElement === this.canvas)
			document.exitPointerLock();
		this.canvas.hidden = true;
		if (!this.dialog.open)
			return;
		this.dialog.close();
		for (const [node, marker] of this.homes)
			marker.after(node);
		if (this.previousFocus?.isConnected)
			this.previousFocus.focus({preventScroll: true});
	}
}
