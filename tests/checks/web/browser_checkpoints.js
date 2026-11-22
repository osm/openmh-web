'use strict';

const configuration =
	'PlayerName Browser saves\nGameType Single\nTrackName RedRock\n' +
	'TrackLaps 1\nMenuConfirmation Off\nSFXVolume 0\nMusicVolume 0\n' +
	'Renderer Glide\nScreenDimension 640 480\n';

async function savedLaps() {
	const snapshot = await game.storage.database.read();
	const entry = snapshot?.entries.find(
		(entry) => entry.path === 'motorhead.cfg');
	return entry ? Number(new TextDecoder()
				       .decode(entry.data)
				       .match(/\bTrackLaps\s+(\d+)/)
				       ?.[1])
		     : 0;
}

async function waitForLaps(laps) {
	const deadline = performance.now() + 15000;
	while ((await savedLaps()) !== laps) {
		if (!error.hidden)
			throw new Error(error.textContent);
		if (performance.now() > deadline)
			throw new Error('Expected saved lap count ' + laps);
		await sleep(100);
	}
}

async function setup() {
	await press('Enter');
	await page('single');
	await press('ArrowRight');
	await press('Enter');
	await page('setup');
	await press('ArrowDown');
}

async function rejectedWrite() {
	await waitForMenuInput();
	await press('ArrowRight');
	const write = game.storage.database.write.bind(game.storage.database);
	game.storage.database.write = async () => {
		throw new Error('Injected save failure');
	};
	checkpoints.request();
	const deadline = performance.now() + 5000;
	while (retryStorage.hidden) {
		if (performance.now() > deadline)
			throw new Error('Missing save failure UI');
		await sleep(50);
	}
	check((await savedLaps()) === 3,
		'failed checkpoint retains the previous durable settings');
	check(error.textContent.includes('Injected save failure'),
		'save failure is shown with a retry action');
	game.storage.database.write = write;
	retryStorage.click();
	await waitForLaps(5);
	check(error.hidden && retryStorage.hidden,
		'retry commits the retained settings and clears the failure');
}

async function rejectedLocalSave() {
	await waitForMenuInput();
	await press('ArrowRight');
	const rename = game.FS.rename;
	let missing;
	try {
		game.FS.stat('/checkpoint-failure-does-not-exist');
	} catch (reason) {
		missing = reason;
	}
	// Fail publication in the local save backend, before IndexedDB is involved.
	game.FS.rename = (from, to) => {
		if (to.endsWith('/motorhead.cfg'))
			throw missing;
		return rename(from, to);
	};
	try {
		checkpoints.request();
	} finally {
		game.FS.rename = rename;
	}
	check(checkpoints.failed && !retryStorage.hidden &&
			error.textContent.length > 0,
		'local checkpoint failure reports an actionable error');
	check((await savedLaps()) === 5,
		'local save failure leaves the durable settings intact');
	retryStorage.click();
	await waitForLaps(10);
	check(!checkpoints.failed && retryStorage.hidden,
		'retry regenerates a failed local save before committing it');
}

async function hideDuringCommit() {
	await waitForMenuInput();
	await press('ArrowRight');
	const write = game.storage.database.write.bind(game.storage.database);
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	game.storage.database.write = async (snapshot) => {
		await gate;
		return write(snapshot);
	};
	checkpoints.request();
	await waitFor(
		() => game.storage.status === 1, 'delayed checkpoint begins');
	const checkpoint = checkpoints.checkpoint;
	const attempts = [];
	checkpoints.checkpoint = () => {
		const result = checkpoint();
		attempts.push(result);
		return result;
	};
	// Stop future animation frames: hidden browsers do not promise any RAF work.
	window.requestAnimationFrame = () => 0;
	window.dispatchEvent(new PageTransitionEvent('pagehide'));
	check(game.suspension?.suspended === 1,
		'page hide suspends before requesting its checkpoint');
	const frozen = JSON.stringify(game.flow);
	release();
	await waitForLaps(15);
	await sleep(500);
	check(attempts.includes(0) && attempts.includes(1),
		'page-hide checkpoint retries after an earlier pending commit');
	check(JSON.stringify(game.flow) === frozen,
		'checkpoint polling does not advance the hidden menu');
	check(!game.storage.dirty && game.storage.status === 0,
		'hidden checkpoint finishes an earlier commit without animation frames');
	sessionStorage.setItem('checkpoint-reload', '15');
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
}

async function run() {
	const expected = sessionStorage.getItem('checkpoint-reload');
	await loadFixtureGame(expected ? null : configuration);
	await openFixtureMenu();
	if (expected) {
		const entry = game.storage.snapshot().entries.find(
			(entry) => entry.path === 'motorhead.cfg');
		check(new TextDecoder()
				.decode(entry.data)
				.match(/\bTrackLaps\s+15\b/),
			'menu settings restore after reload without exiting the game');
		check((await savedLaps()) === Number(expected),
			'the durable checkpoint survives page reload');
		return fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
	}
	await setup();
	await press('ArrowRight');
	const backup = await game.saves.exportSnapshot();
	const config =
		backup.entries.find((entry) => entry.path === 'motorhead.cfg');
	check(/\bTrackLaps\s+3\b/.test(new TextDecoder().decode(config.data)),
		'backup checkpoints current menu edits before taking its snapshot');
	await waitForLaps(3);
	check(game.flow.stage === 'setup',
		'periodic checkpoint saves edits without leaving their menu');
	await rejectedWrite();
	await rejectedLocalSave();
	await hideDuringCommit();
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
