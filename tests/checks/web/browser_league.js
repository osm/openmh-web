'use strict';

const diagnostics = captureFlowErrors();

const configuration =
	'PlayerName Browser league\nTeamName TEST\nGameType League\n' +
	'LeagueName Default\nCarName Resonic\nTrackName Goldbridge\n' +
	'CarTransmission Auto\nDifficulty Easy\nRecordRace Off\n' +
	'MenuConfirmation Off\nSFXVolume 0\nMusicVolume 0\n' +
	'Renderer Glide\nScreenDimension 640 480\n';

async function enterLeague() {
	await press('Enter');
	await page('single');
	for (let attempt = 0; game.choices.single !== 2 && attempt < 5;
		attempt++)
		await press('ArrowRight');
	check(game.choices.single === 2, 'single-player menu selects League');
	await press('Enter');
	await page('league');
	await press('Enter');
	await page('standings');
}

async function stableFiles() {
	await waitFor(() => !game.storage.dirty && game.storage.status === 0,
		'League persistence');
	return savedFiles();
}

function leagueFiles(files) {
	return Object.fromEntries(
		Object.entries(files).filter(([name]) => /\.lgf$/i.test(name)));
}

async function reload(phase) {
	sessionStorage.setItem(
		'league-files', JSON.stringify(await stableFiles()));
	sessionStorage.setItem('league-phase', phase);
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
}

async function startRace(round) {
	await press('Enter');
	await page('car');
	check(game.league.car === 8,
		'League uses the selected eligible Resonic');
	await press('Enter');
	await page('loading');
	check(game.flow.milliseconds === 0,
		'League loading confirmation holds its clock');
	check(game.raceSetup.mode === 1 &&
			game.raceSetup.track === [8, 1][round] &&
			game.raceSetup.laps === [5, 3][round],
		'League follows the opening division track and lap schedule');
	// Starting the session saves car selection before any race result exists.
	const before = await stableFiles();
	await press('Enter');
	await page('race');
	check(game.flow.cars === 8, 'League starts its eight-car field');
	return before;
}

async function finishRace() {
	const deadline = performance.now() + 600000;
	let sample = {x: game.flow.x, z: game.flow.z, time: 0};
	let recoveries = 0;
	while (game.flow.stage !== 'results') {
		if (performance.now() > deadline ||
			!['race', 'finish'].includes(game.flow.stage))
			throw new Error('League race did not finish: ' +
				JSON.stringify(game.flow));
		if (game.flow.milliseconds - sample.time > 10000) {
			if (!game.flow.finished &&
				Math.hypot(game.flow.x - sample.x,
					game.flow.z - sample.z) < 2) {
				// The native campaign fixture also uses the ordinary recover shortcut.
				await press('r');
				if (++recoveries > 5)
					throw new Error(
						'League test driver repeatedly stalled');
			}
			sample = {
				x: game.flow.x,
				z: game.flow.z,
				time: game.flow.milliseconds
			};
		}
		await sleep(250);
	}
	check(game.flow.finished && game.flow.lap >= game.raceSetup.laps &&
			game.flow.frames > 100,
		'League driver completes every lap through physics');
	// Promotion depends on the season total, not a top-two finish in each race.
	check(game.flow.position >= 1 && game.flow.position <= game.flow.cars,
		'League result includes the finished driver rank');
}

async function acceptRace(before, commits) {
	const files = await savedFiles();
	const previous = JSON.stringify(leagueFiles(before));
	check(JSON.stringify(leagueFiles(files)) === previous,
		'unaccepted race results leave the League save unchanged');
	await press('Enter');
	await waitFor(() => game.flow.commits === commits + 1,
		'League results commit');
	const after = leagueFiles(await savedFiles());
	check(Object.keys(after).length > 0 &&
			JSON.stringify(after) !== previous,
		'accepted results update the League document');
}

async function acceptSeason() {
	await waitFor(() => game.season?.active, 'season standings');
	check(!Object.keys(await savedFiles())
			.some((name) => /\.flg$/i.test(name)),
		'season standings wait for acceptance before awarding unlocks');
	await game.seasonCapture;
	const frames = game.movie.frames;
	await press('Enter');
	await waitFor(() => game.movie.frames >= frames + 3, 'promotion movie');
	check(!game.season.active,
		'accepting season standings starts its movie');
	await press('Escape');
	await page('standings');
	check(game.league.stage === 2 && game.league.race === 0,
		'accepted season promotes the player and resets the race index');
	const files = await stableFiles();
	const awards =
		Object.keys(files)
			.filter((name) => /\.flg$/i.test(name))
			.map((name) => name.split('/').pop().toLowerCase())
			.sort();
	check(JSON.stringify(awards) ===
			JSON.stringify(['goldbridge.flg', 'redrock.flg']),
		'promotion persists exactly the opening division track awards');
	const initial = JSON.parse(sessionStorage.getItem('league-initial'));
	check(game.league.tracks > initial.tracks &&
			game.league.cars > initial.cars,
		'earned progress unlocks additional tracks and cars without a cheat');
	sessionStorage.setItem('league-promoted', JSON.stringify(game.league));
}

async function run() {
	const phase = sessionStorage.getItem('league-phase');
	await loadFixtureGame(phase ? null : configuration);
	await openFixtureMenu();
	if (phase)
		check(JSON.stringify(await savedFiles()) ===
				sessionStorage.getItem('league-files'),
			'League saves restore byte-for-byte after reload: ' +
				phase);
	await enterLeague();
	if (phase === 'complete') {
		check(JSON.stringify(game.league) ===
				sessionStorage.getItem('league-promoted'),
			'reloaded menus retain the promoted division and earned unlocks');
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
		return;
	}
	const round = phase === 'second-race' ? 1 : 0;
	check(game.league.stage === 3 && game.league.race === round,
		'League standings resume the expected opening division race: ' +
			round);
	if (!phase)
		sessionStorage.setItem(
			'league-initial', JSON.stringify(game.league));
	const commits = game.flow.commits;
	const before = await startRace(round);
	await finishRace();
	await acceptRace(before, commits);
	if (round === 0) {
		await page('standings');
		check(game.league.race === 1 && game.league.points > 0,
			'first race advances saved standings and awards points');
		return reload('second-race');
	}
	await acceptSeason();
	await reload('complete');
}

run().catch(async (reason) => {
	await fetch('/report', {
		method: 'POST',
		body: JSON.stringify({
			passed: false,
			checks,
			error: String(reason) + '\n' + (reason.stack || ''),
			state: game?.flow,
			league: game?.league,
			setup: game?.raceSetup,
			season: game?.season,
			diagnostic: lastError,
			diagnostics
		})
	});
});
