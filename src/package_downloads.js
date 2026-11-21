'use strict';

class OpenMHPackageDownloads {
	static link(file, text) {
		const link = document.createElement('a');
		const label = 'Download ' + file.name;

		link.className = 'button';
		link.href = URL.createObjectURL(file);
		link.download = file.name;
		link.textContent = text || label;
		if (text)
			link.setAttribute('aria-label', label);
		return link;
	}

	static clear(container) {
		for (const link of container.querySelectorAll('a[download]'))
			URL.revokeObjectURL(link.href);
		container.replaceChildren();
	}
}
