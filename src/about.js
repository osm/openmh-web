(() => {
	const shortcut = ['ControlLeft', 'AltLeft', 'AltRight'];
	const held = new Set();
	const credits = [...document.querySelectorAll('[data-alternate]')].map(
		(element) => ({element, name: element.textContent}));
	let alternate = false;

	function update() {
		const active = shortcut.every((code) => held.has(code));

		if (active === alternate)
			return;

		alternate = active;
		for (const {element, name} of credits)
			element.textContent =
				active ? element.dataset.alternate : name;
	}

	function key(event) {
		if (!shortcut.includes(event.code))
			return;

		if (event.type === 'keydown')
			held.add(event.code);
		else
			held.delete(event.code);

		update();
		if (alternate)
			event.preventDefault();
	}

	function reset() {
		held.clear();
		update();
	}

	window.addEventListener('keydown', key);
	window.addEventListener('keyup', key);
	window.addEventListener('blur', reset);
	window.addEventListener('pagehide', reset);
	document.addEventListener('visibilitychange', () => {
		if (document.hidden)
			reset();
	});
})();
