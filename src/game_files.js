'use strict';

const tabs = new OpenMHTabs(document.getElementById('library-tabs'));
const packages = new OpenMHPackages(() => content.open(packages.id));
const content = new OpenMHContent(
	packages, (value) => content.open(value), () => packages.busy);
const addPackages = async (files, target) => {
	packages.busy = true;
	try {
		await packages.saveFiles(files, target);
		packages.status.textContent = '';
		packages.section.scrollIntoView(
			{block: 'nearest', behavior: 'smooth'});
	} catch (error) {
		packages.status.textContent = error.message;
	} finally {
		packages.busy = false;
	}
};
const preparation = new OpenMHPreparation(packages, (href, id) => {
	if (href !== location.href)
		history.pushState(null, '', href);
	content.requested = id;
	tabs.restore();
});
packages.onChange = (id) => {
	content.refresh(id);
	preparation.checkRecords();
};
packages.watchLibrary();
const input = document.getElementById('assets');
input.disabled = true;
packages.bindInput((files, target) => {
	if (target)
		addPackages(files, target);
	else if (!document.getElementById('browser-guide').hidden &&
		!document.getElementById('prepare-panel').hidden)
		preparation.select(files);
});
packages.ready.then(() => {
	input.disabled = false;
	if (content.requested !== null &&
		!document.getElementById('prepare-panel').hidden)
		preparation.showTarget(content.requested);
});
window.addEventListener('popstate', () => {
	const id = new URL(location.href).searchParams.get('content');
	if (id === content.requested)
		return;
	content.requested = id;
	content.refresh(content.preferred(), true);
	if (!document.getElementById('prepare-panel').hidden &&
		preparation.importer.form.hidden) {
		if (id)
			preparation.showTarget(id);
		else
			preparation.importer.clearUpdate();
	}
});
window.addEventListener('beforeunload', (event) => {
	if (packages.busy) {
		event.preventDefault();
		event.returnValue = '';
	}
});
