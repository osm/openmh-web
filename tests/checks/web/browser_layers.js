'use strict';

async function runLayers() {
	await packages.ready;
	const counts = await (await fetch('/counts.json')).json();
	if (location.search === '?removed') {
		await waitFor(() => player?.state === 'ready',
			'unpatched game restores',
			60);
		check(packages.files.length === 1,
			'base survives removal and reload');
		check(player.getContent().tracks.length === counts.base,
			'removing add-on restores stock catalog');
		check(!game.FS.lookupPath('/assets/package1.ass', {
				      noent_okay: true
			      }).node,
			'removed overlays are not mounted');
		check(player.getSettings().player.name === 'Layers',
			'saves survive removal of overlays');
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
		return;
	}
	const files = [];
	for (const [url, name] of [['/addon.ass', 'first.ass'],
		     ['/patch.ass', 'second.ass'],
		     ['/game.ass', 'last.ass']])
		files.push(new File([await (await fetch(url)).blob()], name));
	await loadPackage(files);
	check(player?.state === 'ready',
		'engine probes base, patch and add-on independently of input order');
	const content = player.getContent();
	check(content.tracks.length === counts.combined,
		'named track definition is discovered');
	const extra =
		content.tracks.find((track) => track.name === 'LayerTest');
	check(extra?.available,
		'add-on is available without unlocking stock tracks');
	check(content.tracks.some((track) => !track.available),
		'add-on does not unlock stock courses');
	await player.startRace({
		player: {name: 'Layers'},
		car: content.cars.find((car) => car.available).id,
		track: extra.id,
		mode: 'timeAttack',
		graphics: {renderer: 'openmh', width: 640, height: 480},
		sound: {effectsVolume: 0, musicVolume: 0}
	});
	await waitFor(() => game.flow?.frames > 10,
		'race renders through combined resources',
		90);
	await player.leaveRace();
	check(player.state === 'finished', 'add-on race returns to setup');
	const stored = await packages.database.read(packages.id);
	check(stored.files.length === 3,
		'all three packages are remembered together');
	await packages.removeFile('first.ass');
	await packages.removeFile('second.ass');
	check(packages.files.length === 1 && packages.file.name === 'last.ass',
		'removing patch and add-on keeps the base');
	await player.destroy();
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.search = '?removed';
}

runLayers().catch((reason) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify(
		{passed: false, checks, error: reason.stack || String(reason)})
}));
