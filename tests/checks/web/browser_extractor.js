'use strict';

const checks = [];

function check(value, message) {
	if (!value)
		throw new Error(message);
	checks.push(message);
}

async function workspaceChecks() {
	const worker = new Worker('workspace_worker.js');
	try {
		const result = await new Promise((resolve, reject) => {
			worker.onmessage = ({data}) => resolve(data);
			worker.onerror = (event) =>
				reject(new Error(event.message));
			worker.postMessage({});
		});
		if (!result.passed)
			throw new Error(result.error);
		checks.push(...result.checks);
	} finally {
		worker.terminate();
	}
}

async function workspaceRemoved() {
	const root = await navigator.storage.getDirectory();
	try {
		await root.getDirectoryHandle('openmh-extractor');
		return false;
	} catch (error) {
		if (error.name === 'NotFoundError')
			return true;
		throw error;
	}
}

async function rejectedJob(cancel) {
	const controller = new AbortController();
	let published = false;
	const file = new File([new Uint8Array([0, 1, 2, 3])], 'invalid.iso');
	const job = new OpenMHExtractionJob('extract-worker.js');
	const promise = job.run({files: [file], source: file.name},
		controller.signal,
		() => {},
		() => {
			published = true;
		});
	if (cancel)
		setTimeout(() => controller.abort(), 0);
	let rejected = false;
	try {
		await promise;
	} catch (error) {
		rejected = true;
		if (cancel)
			check(error.name === 'AbortError',
				'cancel reports cancellation');
	}
	check(rejected && !published,
		(cancel ? 'cancelled' : 'invalid') +
			' conversion never publishes');
	check(await workspaceRemoved(),
		'temporary storage removed after ' +
			(cancel ? 'cancellation' : 'failure'));
}

async function publicationFailure() {
	const previous = new File([new Uint8Array([5, 4, 3])], 'previous.ass');
	check(await packages.remember(previous), 'original package is saved');
	const original = packages.record;
	const key = OpenMHPackageDatabase.key(original.id);
	const put = IDBObjectStore.prototype.put;
	let aborted = false, failed = false;
	IDBObjectStore.prototype.put = function(...args) {
		const request = put.apply(this, args);
		if (args[1] === key) {
			this.transaction.abort();
			aborted = true;
		}
		return request;
	};
	try {
		const job = new OpenMHExtractionJob('extract-worker.js');
		await job.run({files: [previous], source: previous.name},
			new AbortController().signal,
			() => {},
			(file) => packages.storePrepared(
				new File([file], 'replacement.ass'),
				undefined,
				original));
	} catch {
		failed = true;
	} finally {
		IDBObjectStore.prototype.put = put;
	}
	check(aborted && failed,
		'aborting the replacement write rejects publication');
	const saved = await packages.database.read(original.id);
	check(original.revision && saved?.revision === original.revision,
		'failed replacement preserves the saved revision');
	const record = saved.files[0];
	check(record.name === previous.name &&
			String(new Uint8Array(
				await record.blob.arrayBuffer())) === '5,4,3',
		'failed publication preserves the old package bytes');
	check(await workspaceRemoved(),
		'failed publication removes temporary storage');
}

async function concurrentJob() {
	await navigator.locks.request('openmh-extractor', async () => {
		let failed = false;
		try {
			await new OpenMHExtractionJob('extract-worker.js')
				.run({},
					new AbortController().signal,
					() => {},
					() => {});
		} catch (error) {
			failed = error.message.includes('Another tab');
		}
		check(failed, 'another job cannot remove an active workspace');
	});
}

async function cancelActiveImport(request, operation = null) {
	const controller = new AbortController();
	let began = false;
	let published = false;
	let cancelled = false;
	try {
		await new OpenMHExtractionJob('extract-worker.js')
			.run(request,
				controller.signal,
				(progress) => {
					if (operation &&
						progress.operation !==
							operation)
						return;
					began = true;
					controller.abort();
				},
				() => {
					published = true;
				});
	} catch (error) {
		cancelled = error.name === 'AbortError';
	}
	check(began && cancelled && !published,
		operation ? 'cancel interrupts compact media conversion'
			  : 'cancel interrupts active native extraction');
	check(await workspaceRemoved(),
		'active cancellation releases disk storage');
}

async function zipEntries(file, locations = {}) {
	// Inspect bounded central-directory bytes, even for a CD-sized package.
	const tail = new DataView(await file.slice(-22).arrayBuffer());
	check(tail.getUint32(0, true) === 0x06054b50,
		'completed output has a ZIP end record');
	const start = tail.getUint32(16, true);
	const size = tail.getUint32(12, true);
	const buffer = await file.slice(start, start + size).arrayBuffer();
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const entries = {};
	let offset = 0;
	while (offset < size) {
		if (view.getUint32(offset, true) !== 0x02014b50)
			throw new Error('Invalid ZIP directory.');
		const length = view.getUint16(offset + 28, true);
		const name = new TextDecoder().decode(
			bytes.subarray(offset + 46, offset + 46 + length));
		locations[name] = {
			offset: view.getUint32(offset + 42, true),
			method: view.getUint16(offset + 10, true),
			size: view.getUint32(offset + 24, true)
		};
		entries[name] = [
			view.getUint32(offset + 16, true),
			view.getUint32(offset + 24, true)
		];
		offset += 46 + length + view.getUint16(offset + 30, true) +
			view.getUint16(offset + 32, true);
	}
	return entries;
}

async function checkMoviePlayback(bytes, name) {
	const video = document.createElement('video');
	const url =
		URL.createObjectURL(new Blob([bytes], {type: 'video/webm'}));
	try {
		await new Promise((resolve, reject) => {
			video.onloadeddata = resolve;
			video.onerror = () => reject(
				new Error('Cannot decode movie: ' + name));
			video.src = url;
			video.preload = 'auto';
			video.load();
		});
		check(video.videoWidth > 0 && video.videoHeight > 0 &&
				video.duration > 0,
			'converted movie decodes for playback: ' + name);
	} finally {
		video.removeAttribute('src');
		video.load();
		URL.revokeObjectURL(url);
	}
}

async function checkCompactMedia(file, locations, names) {
	for (const name of names) {
		const entry = locations[name];
		check(entry.method === 0,
			'compacted media remains seekable: ' + name);
		const header = new DataView(
			await file.slice(entry.offset, entry.offset + 30)
				.arrayBuffer());
		const start = entry.offset + 30 + header.getUint16(26, true) +
			header.getUint16(28, true);
		const bytes = new Uint8Array(
			await file.slice(start, start + entry.size)
				.arrayBuffer());
		if (/\.opus$/i.test(name)) {
			check(new TextDecoder().decode(bytes.subarray(0, 4)) ===
						'OggS' &&
					new TextDecoder().decode(bytes.subarray(
						28, 36)) === 'OpusHead',
				'music is encoded as Ogg Opus: ' + name);
			const audio = new OfflineAudioContext(2, 1, 48000);
			const decoded =
				await audio.decodeAudioData(bytes.buffer);
			check(decoded.length > 0 &&
					decoded.numberOfChannels > 0,
				'converted music decodes for playback: ' +
					name);
		} else {
			const view = new DataView(bytes.buffer);
			check(new TextDecoder().decode(bytes.subarray(0, 4)) ===
					'DIVI',
				'movie collection retains its index: ' + name);
			for (let i = 0; i < view.getUint32(4, true); i++) {
				const offset =
					view.getUint32(16 + i * 12, true);
				check(view.getUint32(offset) === 0x1a45dfa3,
					'movie clip is encoded as WebM: ' +
						name + '/' + i);
				const end = i + 1 < view.getUint32(4, true)
					? view.getUint32(
						  16 + (i + 1) * 12, true)
					: bytes.length;
				await checkMoviePlayback(
					bytes.subarray(offset, end),
					name + '/' + i);
			}
		}
	}
}

async function realImport(config) {
	const previousId = packages.id;
	let updatedId = null;
	// Keep CD-sized fixture inputs on disk, as a real file selection would.
	const root = await navigator.storage.getDirectory();
	const inputs =
		await root.getDirectoryHandle('fixture-inputs', {create: true});
	const files = [];
	for (const entry of config.files) {
		const handle =
			await inputs.getFileHandle(entry.name, {create: true});
		const response = await fetch(entry.url);
		await response.body.pipeTo(await handle.createWritable());
		files.push(await handle.getFile());
	}
	let played;
	const measuredStages = new Set();
	const updateProgress =
		importer.progressView.update.bind(importer.progressView);
	importer.progressView.update = (progress) => {
		if (progress.total > 0) {
			if (progress.completed < 0 ||
				progress.completed > progress.total)
				throw new Error('Invalid progress counts');
			measuredStages.add(progress.stage);
		}
		updateProgress(progress);
	};
	importer.play = (file, remember) => {
		played = file;
		check(!remember,
			'prepared package is already remembered before launch');
	};
	if (/\.ass$/i.test(config.source)) {
		const base = files.find((file) => file.name === config.source);
		await packages.remember(base);
		updatedId = packages.id;
		const additions = new DataTransfer();
		for (const file of files)
			if (file !== base)
				additions.items.add(file);
		const input = document.getElementById('add-packages');
		input.files = additions.files;
		input.dispatchEvent(new Event('change'));
		check(importer.source.value === base.name &&
				importer.patch.value,
			'a patch selected alone uses the remembered base package');
	} else
		importer.select(files);
	importer.source.value = config.source;
	importer.selectPatch();
	document.getElementById('prepare-no-music').checked =
		config.excludeMusic;
	document.getElementById('prepare-no-movies').checked =
		config.excludeMovies;
	await cancelActiveImport(importer.request());
	if (config.media.length)
		await cancelActiveImport(importer.request(), 'convert');
	const progress = setInterval(() => fetch('/progress', {
		method: 'POST',
		body: JSON.stringify(
			{message: importer.progressView.label.textContent})
	}),
		1000);
	try {
		await importer.prepare();
	} finally {
		clearInterval(progress);
	}
	check(['prepare', 'build', 'export', 'save'].every(
		      (stage) => measuredStages.has(stage)),
		'each preparation stage reports measured counts');
	const collection = Array.isArray(played) ? played : [played];
	played = collection[0];
	check(collection.length === 1, 'preparation produces one game package');
	check(played instanceof File,
		'preparation launches a package: ' +
			importer.status.textContent);
	const locations = {};
	const entries = await zipEntries(played, locations);
	check(Object.keys(entries).length ===
			Object.keys(config.entries).length,
		'native and browser packages have the same entry count');
	for (const [name, expected] of Object.entries(config.entries))
		if (!config.media.includes(name) &&
			String(entries[name]) !== String(expected))
			throw new Error('Native parity mismatch: ' + name);
	check(true, 'non-media asset sizes and CRCs match native extraction');
	await checkCompactMedia(played, locations, config.media);
	check(await workspaceRemoved(),
		'successful import removes temporary storage');
	check(!updatedId || packages.id === updatedId,
		'patching updates the selected game without duplicating it');
	const previous = (await packages.database.read(previousId)).files[0];
	check(previous.name === 'previous.ass' &&
			String(new Uint8Array(
				await previous.blob.arrayBuffer())) === '5,4,3',
		'converting another game preserves the earlier library entry');
	check(packages.library.length === 2,
		'conversion leaves both games in the library');
	const stored = await packages.database.read(packages.id);
	const restoredFiles = OpenMHPackageDatabase.entries(stored);
	check(restoredFiles.length === collection.length,
		'all prepared packages are committed together');
	const restored = restoredFiles[0];
	check(restored.name === played.name &&
			restored.blob.size === played.size,
		'finished package survives an independent database read');
	const restoredEntries = await zipEntries(restored.blob);
	check(JSON.stringify(restoredEntries) === JSON.stringify(entries),
		'remembered package remains readable after scratch deletion');
	const download = document.querySelector('#package-files a[download]');
	check(download && !download.hidden && download.download === played.name,
		'finished package has a download link');
	if (config.patch) {
		const request = {
			source: 'prepared.ass',
			files: [
				new File([restored.blob], 'prepared.ass'),
				new File([restored.blob], 'duplicate.ass')
			]
		};
		let published = false, rejected = false, rejection = '';
		try {
			await new OpenMHExtractionJob(importer.workerURL)
				.run(request,
					new AbortController().signal,
					() => {},
					() => {
						published = true;
					});
		} catch (error) {
			rejection = error.message;
			rejected = error.message.includes('multiple');
		}
		check(rejected && !published,
			'incompatible prepared collection is rejected before publication: ' +
				rejection);
		const current = await packages.database.read(stored.id);
		check(stored.revision && current?.revision === stored.revision,
			'rejected preparation keeps the previously remembered game');
	}
	await root.removeEntry('fixture-inputs', {recursive: true});
}

(async () => {
	try {
		await packages.ready;
		await workspaceChecks();
		await rejectedJob(false);
		await rejectedJob(true);
		await publicationFailure();
		await concurrentJob();
		const config = await (await fetch('fixture.json')).json();
		if (config.source)
			await realImport(config);
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
	} catch (error) {
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({
				passed: false,
				checks,
				error: error.stack || String(error)
			})
		});
	}
})();
