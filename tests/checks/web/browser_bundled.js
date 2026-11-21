'use strict';

async function openBundledRace() {
	await waitFor(() => raceSetup && player.state === 'ready',
		'bundled package opens race setup',
		60);
	check(game.FS.readdir('/assets')
				.filter((name) => /\.ass$/i.test(name))
				.length === bundledAssets.split(';').length,
		'every configured package is mounted');
	check(launcher.hidden && picker.hidden,
		'bundled package skips the asset picker');
	check(packages.files.length === 0,
		'bundled package stays outside remembered uploads');
	check(picker.contains(content.select) &&
			document.getElementById('remembered-package').hidden,
		'the game selector stays in the picker and the demo has no removal controls');
	check(raceSetup.renderer.name === 'OpenMH',
		'bundled page selects OpenMH');
	check(!game.movie && !game.flow,
		'bundled page opens no original menus or movies');
}

async function raceAndReload() {
	raceSetup.input('resolution').value = '640x480';
	raceSetup.input('effectsVolume').value = 0;
	raceSetup.input('musicVolume').value = 0;
	raceSetup.form.requestSubmit();
	await waitFor(() => player.state === 'racing' &&
			game.flow?.frames > 10 && !raceSetup.starting,
		'bundled assets run a race',
		60);
	check(raceSetup.message.textContent === '',
		'bundled race has no ready status');
	await player.leaveRace();
	await waitFor(() => !game.storage.dirty && game.storage.status === 0,
		'bundled race history saved',
		15);
	check(document.getElementById('results-overlay').open,
		'bundled race opens floating results');
	check(!saveTools.section.hidden && picker.contains(content.select),
		'save tools return after racing and game selection stays in the picker');
	const saved = await game.storage.database.read();
	check(saved.entries.some(
		      (entry) => entry.path === 'racehistory.json') &&
			!saved.entries.some(
				(entry) => entry.path.endsWith('.ass')),
		'bundled history is saved without copying assets into user saves');
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.search = '?content=builtin';
}

async function run() {
	await openBundledRace();
	if (location.search === '?content=builtin') {
		check(document.getElementById('race-history').options.length ===
					1 &&
				!raceSetup.results.hidden,
			'bundled race history survives a full reload');
		check(!document.getElementById('race-panel').hidden,
			'explicit bundled selection opens race setup');
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
		return;
	}
	await raceAndReload();
}

run().catch((reason) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify({
		passed: false,
		checks,
		error: reason.stack || String(reason),
		message: error.textContent
	})
}));
