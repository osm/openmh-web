'use strict';

class OpenMHPackageInput {
	constructor(choose, unavailable) {
		for (const [id, append] of [['assets', false],
			     ['add-packages', true]]) {
			document.getElementById(id)?.addEventListener(
				'change', (event) => {
					choose(event.target.files, append);
					event.target.value = '';
				});
		}
		this.bindDropArea(choose, unavailable);
	}

	bindDropArea(choose, unavailable) {
		const area = document.querySelector('.package-upload');
		if (!area)
			return;
		const acceptsDrop = () =>
			!unavailable() && !area.closest('[hidden]');
		const hasFiles = event =>
			Array.from(event.dataTransfer.types).includes('Files');
		let depth = 0;
		const reset = () => {
			depth = 0;
			area.classList.remove('is-dragging');
		};
		document.addEventListener('dragenter', (event) => {
			if (!acceptsDrop() || !hasFiles(event))
				return;
			depth++;
			area.classList.add('is-dragging');
		});
		document.addEventListener('dragleave', () => {
			if (depth && --depth === 0)
				reset();
		});
		document.addEventListener('dragend', reset);
		document.addEventListener('dragover', (event) => {
			if (!hasFiles(event))
				return;
			event.preventDefault();
			event.dataTransfer.dropEffect =
				acceptsDrop() ? 'copy' : 'none';
		});
		document.addEventListener('drop', (event) => {
			if (!hasFiles(event))
				return;
			event.preventDefault();
			reset();
			if (acceptsDrop())
				choose(event.dataTransfer.files);
		});
	}
}
