'use strict';

// Same completed-save placements as the native League session acceptance check.
const outcomes = [
	{
		name: 'second division promotion',
		stage: 3,
		slot: 18,
		races: 2,
		next: 2,
		awards: ['Goldbridge', 'RedRock']
	},
	{
		name: 'first division promotion',
		stage: 2,
		slot: 10,
		races: 4,
		next: 1,
		awards: ['NeoCity', 'Atlantika']
	},
	{
		name: 'final promotion',
		stage: 1,
		slot: 2,
		races: 6,
		next: 0,
		awards: ['RuhrStadt', 'Olympos', 'NolbyHills']
	},
	{
		name: 'stay in division',
		stage: 3,
		slot: 21,
		races: 2,
		next: 3,
		awards: []
	},
	{name: 'relegation', stage: 2, slot: 16, races: 4, next: 3, awards: []},
	{
		name: 'final defeat',
		stage: 0,
		slot: 1,
		races: 1,
		next: 1,
		awards: []
	},
	{
		name: 'championship',
		stage: 0,
		slot: 0,
		races: 1,
		next: null,
		awards: ['OkkunSpeedway']
	}
];

const configuration =
	'PlayerName Browser season\nTeamName TEST\nGameType League\n' +
	'LeagueName Default\nCarName Resonic\nTrackName Goldbridge\n' +
	'MenuConfirmation Off\nRecordRace Off\nSFXVolume 0\nMusicVolume 0\n' +
	'Renderer Glide\nScreenDimension 640 480\n';

function awards(files) {
	return Object.keys(files).filter((name) => /\.flg$/i.test(name)).sort();
}

async function prepareCase(index) {
	const fixture = outcomes[index];
	// Only test storage is replaced. The next page loads it through the ordinary save parser.
	checkpoints.stop();
	check(game._mh_browser_set_suspended(1),
		'suspend before preparing ' + fixture.name);
	await waitFor(
		() => game.storage.status === 0, 'previous save completion');
	check(game._mh_browser_flow_make_league(
		      fixture.slot, fixture.races, 0) === 0,
		'construct completed save for ' + fixture.name);
	game.FS.writeFile('/userdata/default.lgf', game.leagueFixture);
	if (fixture.next === null) {
		check(game._mh_browser_flow_make_league(21, 0, 1) === 0,
			'construct unrelated League save');
		game.FS.writeFile('/userdata/other.lgf', game.leagueFixture);
	}
	game.FS.writeFile('/userdata/motorhead.cfg', configuration);
	game.storage.begin(false);
	await game.storage.operation;
	check(game.storage.status === 0 && !game.storage.dirty,
		'persist prepared ' + fixture.name);
	sessionStorage.setItem('season-case', String(index));
	sessionStorage.removeItem('season-checkpoint');
	sessionStorage.setItem(
		'season-files', JSON.stringify(await savedFiles()));
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
}

async function enterStandings() {
	await press('Enter');
	await page('single');
	for (let attempt = 0; game.choices.single !== 2 && attempt < 5;
		attempt++)
		await press('ArrowRight');
	await press('Enter');
	await page('league');
	await press('Enter');
	await page('standings');
}

async function enterSeason(fixture) {
	await enterStandings();
	check(game.league.stage === fixture.stage &&
			game.league.race === fixture.races,
		'completed save resumes correct standings: ' + fixture.name);
	await press('Enter');
	await page('car');
	await press('Enter');
	await waitFor(
		() => game.season?.active, 'completed season presentation');
	await game.seasonCapture;
	check(!game.raceSetup,
		'completed season does not replay a race: ' + fixture.name);
}

async function acceptSeason(fixture, before) {
	check(JSON.stringify(awards(await savedFiles())) ===
			JSON.stringify(awards(before)),
		'unaccepted season awards nothing: ' + fixture.name);
	const frames = game.movie.frames;
	await press('Enter');
	await waitFor(() => game.movie.frames >= frames + 3, 'season movie');
	check(!game.season.active, 'season movie plays: ' + fixture.name);
	await press('Escape');
	await page(fixture.next === null ? 'main' : 'standings');
	await waitFor(() => game.storage.status === 0 && !game.storage.dirty,
		'season persistence');
	const after = await savedFiles();
	const expected = new Set(awards(before));
	for (const name of fixture.awards)
		expected.add(name.toLowerCase() + '.flg');
	check(JSON.stringify(awards(after)) ===
			JSON.stringify([...expected].sort()),
		'exact earned markers persist: ' + fixture.name);
	check(awards(before).every((name) => before[name] === after[name]),
		'existing awards remain unchanged: ' + fixture.name);
	if (fixture.next === null) {
		check(!after['default.lgf'] &&
				after['other.lgf'] === before['other.lgf'],
			'championship removes only the winning League and returns to the main menu');
	} else {
		check(game.league.stage === fixture.next &&
				game.league.race === 0 &&
				game.league.points === 0,
			'rollover resets the season in the correct division: ' +
				fixture.name);
	}
	return after;
}

async function run() {
	const phase = sessionStorage.getItem('season-case');
	await loadFixtureGame(phase === null ? configuration : null);
	await openFixtureMenu();
	if (phase === null) {
		await enterStandings();
		return prepareCase(0);
	}
	check(JSON.stringify(await savedFiles()) ===
			sessionStorage.getItem('season-files'),
		'prepared or completed saves restore byte-for-byte: ' + phase);
	const index = Number(phase), fixture = outcomes[index];
	if (sessionStorage.getItem('season-checkpoint')) {
		if (fixture.next !== null) {
			await enterStandings();
			check(game.league.stage === fixture.next &&
					game.league.race === 0 &&
					game.league.points === 0,
				'reloaded menus retain the completed transition: ' +
					fixture.name);
		}
		if (index + 1 < outcomes.length)
			return prepareCase(index + 1);
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
		return;
	}
	const before = await savedFiles();
	await enterSeason(fixture);
	const after = await acceptSeason(fixture, before);
	sessionStorage.setItem('season-checkpoint', '1');
	sessionStorage.setItem('season-files', JSON.stringify(after));
	sessionStorage.setItem('flow-checks', JSON.stringify(checks));
	location.reload();
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
			season: game?.season,
			diagnostic: lastError
		})
	});
});
