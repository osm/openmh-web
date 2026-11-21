'use strict';

const diagnostics = [];
const logError = console.error;
console.error = (...args) => {
	diagnostics.push(args.join(' '));
	logError(...args);
};

async function run() {
	game = (await runtime()).engine;
	const main = game.callMain;
	game.callMain = (args) => {
		args[args.indexOf('--audio') + 1] = '0';
		args.push('--unlock-all');
		return main(args);
	};
	const blob = await (await fetch('/game.ass')).blob();
	await loadPackage(new File([blob], 'edition.ass'));
	const content = player.getContent();
	check(content.renderers.length === 5 &&
			content.renderers.some(
				(renderer) => renderer.available),
		'package exposes stable renderer IDs and at least one included profile');
	check(raceSetup.renderer.available &&
			(!content.renderers.some((item) => item.available &&
					 item.name === 'OpenMH') ||
				raceSetup.renderer.name === 'OpenMH'),
		'web form selects an included profile, preferring OpenMH');
	raceSetup.input('effectsVolume').value = 0;
	raceSetup.input('musicVolume').value = 0;
	raceSetup.input('laps').value = 1;
	for (const renderer of content.renderers
			.filter((item) => item.available)
			.sort((a, b) => Number(b.name === 'OpenMH') -
					Number(a.name === 'OpenMH'))) {
		raceSetup.renderer = renderer;
		raceSetup.populateResolutions({width: 640, height: 480});
		// Every authored track must load, including the early demo layouts.
		for (const track of content.tracks.filter(
			     (entry) => entry.available)) {
			raceSetup.input('track').value = track.id;
			document.getElementById('race-tab').click();
			raceSetup.form.requestSubmit();
			await waitFor(() => {
				if (player.state === 'failed')
					throw new Error(
						raceSetup.message.textContent);
				return (player.state === 'racing' &&
					!raceSetup.starting);
			}, renderer.name + ': start ' + track.name, 45);
			await waitFor(() => game.flow?.stage === 'race' &&
					game.flow.frames >= 30,
				renderer.name + ': render ' + track.name,
				30);
			check(player.getSettings().graphics.renderer ===
					renderer.id,
				renderer.name +
					': selected profile retained on ' +
					track.name);
			const frames = game.flow.frames;
			await waitFor(() => game.flow.frames >= frames + 10,
				renderer.name + ': advance ' + track.name,
				15);
			check(player.state === 'racing',
				renderer.name + ': race advances on ' +
					track.name);
			await player.leaveRace();
			check(player.state === 'finished',
				renderer.name + ': clean race return from ' +
					track.name);
		}
	}
	await fetch('/report',
		{method: 'POST', body: JSON.stringify({passed: true, checks})});
}

run().catch((reason) => fetch('/report', {
	method: 'POST',
	body: JSON.stringify({
		passed: false,
		checks,
		error: reason.stack || String(reason),
		state: game?.flow,
		diagnostics,
		frontend: player?.state,
		message: raceSetup?.message.textContent
	})
}));
