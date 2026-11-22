'use strict';

class OpenMHRaceResults {
	constructor(player) {
		this.player = player;
		this.section = document.getElementById('race-results');
		this.select = document.getElementById('race-history');
		this.status = document.getElementById('history-status');
		this.races = [];
		this.dialog = document.getElementById('results-overlay');
		document.getElementById('close-results')
			.addEventListener('click', () => this.closeSummary());
		this.select.addEventListener(
			'change', () => this.show(Number(this.select.value)));
		this.refresh();
	}

	refresh() {
		const history = this.player.getRaceHistory();
		this.races = history.races;
		this.status.textContent = history.error;
		this.populate();
	}

	populate() {
		this.section.hidden = this.races.length === 0;
		document.getElementById('results-empty').hidden =
			this.races.length !== 0;
		this.select.replaceChildren();
		this.races.forEach((race, index) => {
			const date = new Date(race.date).toLocaleString();
			this.select.add(new Option(
				`${date} · ${race.track} · ${race.car}`,
				index));
		});
		this.show(0);
	}

	show(index) {
		const race = this.races[index];
		const body = document.getElementById('race-result-rows');
		const details = document.getElementById('race-result-details');
		body.replaceChildren();
		details.textContent = '';
		if (!race)
			return;

		details.textContent = `${race.driver} · ${race.mode} · ${
			race.laps} ${race.laps === 1 ? 'lap' : 'laps'}`;
		for (const row of [...race.rows].sort(
			     (a, b) => a.position - b.position))
			body.append(OpenMHRaceResults.resultRow(
				OpenMHRaceResults.resultCells(row)));
	}

	showSummary(rows) {
		if (!rows.length)
			return;
		const body = document.getElementById('summary-result-rows');
		body.replaceChildren(...[...rows]
				.sort((a, b) => (Number(a[0]) || Infinity) -
						(Number(b[0]) || Infinity))
				.map(OpenMHRaceResults.resultRow));
		if (!this.dialog.open)
			this.dialog.showModal();
	}

	closeSummary() {
		this.dialog.close();
	}

	static serverCells(row) {
		return [
			row.position,
			row.name,
			this.resultTime(row.milliseconds),
			this.resultTime(row.bestLap)
		];
	}

	static resultRow(cells) {
		const tr = document.createElement('tr');
		for (const value of cells) {
			const td = document.createElement('td');
			td.textContent = value;
			tr.append(td);
		}
		return tr;
	}

	static resultTime(milliseconds) {
		return milliseconds ? (milliseconds / 1000).toFixed(3) + ' s'
				    : '-';
	}

	static resultCells(row) {
		let finish = 'Unfinished';
		if (row.finished || row.estimated) {
			finish = this.resultTime(row.milliseconds);
			if (row.estimated)
				finish += ' (estimated)';
		}
		return [
			row.position || '-',
			row.player ? 'You' : 'Opponent',
			finish,
			this.resultTime(row.bestLap)
		];
	}
}
