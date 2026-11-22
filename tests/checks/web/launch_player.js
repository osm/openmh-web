'use strict';

if (new URL(location.href).searchParams.has('mobile'))
	Object.defineProperty(
		navigator, 'userAgentData', {value: {mobile: true}});
window.fixtureMounts = [];
if (sessionStorage.getItem('launch-stage') === 'builtin') {
	const download = OpenMH.downloadBlob;
	OpenMH.downloadBlob = async (url, progress) => {
		progress(512, 1024);
		await new Promise(
			(resolve) => window.fixtureFinishDownload = resolve);
		return download(url, progress);
	};
}
OpenMHSession.create = async () => ({
	mount: async (files) => {
		window.fixtureMounts = await Promise.all(files.map(
			async (file) =>
				({name: file.name, text: await file.text()})));
	},
	start: async ({frontend = 'web'}) => {
		window.fixtureFrontend = frontend;
		return new TestPlayer();
	},
	retrySaves: () => true,
	replaceSnapshotAndClose: async snapshot => sessionStorage.setItem(
		'imported-backup', String(snapshot.version)),
	resetData: async (categories) => {
		if (sessionStorage.getItem('reset-denied'))
			throw new Error('Synthetic save reset failure');
		sessionStorage.setItem(
			'reset-categories', JSON.stringify(categories));
	},
	stop: () => {},
	resume: () => {}
});
