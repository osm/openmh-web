'use strict';

class OpenMHImportProgress {
	constructor() {
		this.bar = document.getElementById('prepare-progress');
		this.label = document.getElementById('prepare-progress-label');
		this.stages = [...document.querySelectorAll(
			'#prepare-stages [data-stage]')];
		this.names = {
			starting: 'Starting preparation',
			unpack: 'Extracting files',
			'read-disc': 'Reading disc files',
			installer: 'Unpacking installer',
			movies: 'Extracting movies',
			copy: 'Copying files',
			'read-package': 'Reading package',
			patch: 'Applying update',
			convert: 'Compacting media',
			'write-package': 'Building package',
			'disc-file': 'Reading disc file',
			audio: 'Reading audio track',
			export: 'Preparing download',
			validate: 'Checking package',
			save: 'Saving in browser',
			commit: 'Finishing save',
			complete: 'Saved'
		};
	}

	reset() {
		this.stop();
		for (const stage of this.stages) {
			delete stage.dataset.state;
			stage.querySelector('.stage-state').textContent =
				'Waiting';
		}
	}

	start() {
		this.reset();
		this.update({
			stage: 'prepare',
			operation: 'starting',
			completed: 0,
			total: 0
		});
	}

	stop() {
		this.bar.hidden = true;
		this.label.textContent = '';
	}

	update(progress) {
		const current = this.stages.findIndex(
			(stage) => stage.dataset.stage === progress.stage);
		if (current < 0)
			return;
		const measured = Number.isFinite(progress.total) &&
			progress.total > 0 &&
			Number.isFinite(progress.completed) &&
			progress.completed >= 0;
		const fraction = measured
			? Math.min(1, progress.completed / progress.total)
			: null;
		const state =
			measured ? Math.floor(fraction * 100) + '%' : 'Working';
		for (const [index, stage] of this.stages.entries()) {
			stage.dataset.state = index < current ? 'complete'
				: index === current	      ? 'active'
							      : 'waiting';
			stage.querySelector('.stage-state').textContent =
				index < current	    ? 'Complete'
				: index === current ? state
						    : 'Waiting';
		}
		this.bar.hidden = false;
		this.bar.max = 1;
		if (measured)
			this.bar.value = fraction;
		else
			this.bar.removeAttribute('value');
		const detail = progress.detail ? ' ' + progress.detail : '';
		this.label.textContent =
			(this.names[progress.operation] || 'Preparing game') +
			detail + (measured ? ': ' + state : '');
	}
}
