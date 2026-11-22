'use strict';

const checks = JSON.parse(sessionStorage.getItem('flow-checks') || '[]');
const sleep = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));
const codes = {
	Enter: 13,
	Escape: 27,
	ArrowLeft: 37,
	ArrowRight: 39,
	ArrowUp: 38,
	ArrowDown: 40
};
setInterval(() => fetch('/progress', {
	method: 'POST',
	body: JSON.stringify({checks, state: game?.flow, diagnostic: lastError})
}),
	5000);

function check(value, message) {
	if (!value)
		throw new Error(message);
	checks.push(message);
	console.log('Flow check: ' + message);
}

async function waitFor(predicate, label, seconds = 20) {
	const deadline = performance.now() + seconds * 1000;
	while (!predicate()) {
		if (!error.hidden)
			throw new Error(error.textContent);
		if (performance.now() > deadline)
			throw new Error(
				label + ': ' + JSON.stringify(game?.flow));
		await sleep(50);
	}
}

async function press(key) {
	const number = codes[key] || key.toUpperCase().charCodeAt(0);
	const options = {
		key,
		code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
		keyCode: number,
		which: number,
		bubbles: true
	};
	canvas.focus();
	canvas.dispatchEvent(new KeyboardEvent('keydown', options));
	if (key.length === 1)
		canvas.dispatchEvent(new KeyboardEvent(
			'keypress', {...options, charCode: key.charCodeAt(0)}));
	try {
		await sleep(120);
	} finally {
		canvas.dispatchEvent(new KeyboardEvent('keyup', options));
	}
	await sleep(180);
}

async function waitForMenuInput() {
	// The original menu suppresses its first four keyboard polls after a reset.
	const inputWarmupFrames = 5;
	for (let frame = 0; frame < inputWarmupFrames; frame++) {
		const previous = game.flow;
		await waitFor(() => game.flow !== previous, 'menu input frame');
	}
}

async function page(name) {
	await waitFor(() => game.flow?.stage === name && !game.flow.transition,
		'waiting for ' + name);
	if ('transition' in game.flow)
		await waitForMenuInput();
	else
		await sleep(250);
}

function captureFlowErrors() {
	const diagnostics = [];
	const stderr = console.error.bind(console);
	console.error = (...values) => {
		diagnostics.push(values.map(String).join(' '));
		if (diagnostics.length > 20)
			diagnostics.shift();
		stderr(...values);
	};
	return diagnostics;
}

async function loadFixtureGame(configuration, extraArguments = []) {
	game = (await runtime()).engine;
	const callMain = game.callMain;
	game.callMain = (args) => {
		// League checks exercise earned unlocks even on an unlock-all site.
		const options = args.filter(arg => arg !== '--unlock-all');
		options[options.indexOf('--audio') + 1] = '0';
		return callMain(options.concat(extraArguments));
	};
	if (configuration)
		game.FS.writeFile('/userdata/motorhead.cfg', configuration);

	const response = await fetch('/game.ass');
	const file = new File([await response.blob()], 'fixture.ass');
	// The fixture supplies the game again on reload. Only saves need to persist.
	await loadPackage(file, false);
}

async function openFixtureMenu() {
	for (let attempt = 0; !game.flow && attempt < 15; attempt++) {
		await sleep(400);
		if (!game.flow)
			await press('Escape');
	}
	await page('main');
}

async function savedFiles() {
	const files = {};
	for (const entry of game.storage.snapshot().entries) {
		if (entry.directory)
			continue;
		const hash = await crypto.subtle.digest('SHA-256', entry.data);
		files[entry.path] =
			Array.from(new Uint8Array(hash),
				     (byte) =>
					     byte.toString(16).padStart(2, '0'))
				.join('');
	}
	return files;
}
