'use strict';

async function checkLaunch() {
	if (typeof OpenMHPackageDatabase !== 'undefined')
		OpenMHPackageDatabase.validate = async files => {
			if (files.some(file => !file.size) ||
				files.every(
					file => file.name === 'patch30.ass'))
				throw new Error('Invalid test package.');
		};

	if (window !== window.top)
		return;

	const activeImporter = typeof preparation === 'undefined'
		? null
		: preparation.importer;
	const result =
		typeof preparation === 'undefined' ? null : preparation.result;
	const checks =
		JSON.parse(sessionStorage.getItem('launch-checks') || '[]');
	const check = (value, message) => {
		if (!value)
			throw new Error(message);
		checks.push(message);
	};
	const wait = async (test) => {
		for (let i = 0; i < 500; i++) {
			if (test())
				return;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error('Launch operation timed out: ' +
			document.body.innerText);
	};
	const next = (stage, url) => {
		sessionStorage.setItem('launch-stage', stage);
		sessionStorage.setItem('launch-checks', JSON.stringify(checks));
		const destination = new URL(url, location.href);
		const samePage = destination.pathname === location.pathname &&
			destination.search === location.search;
		location.href = destination;
		if (samePage)
			location.reload();
	};
	const checkPicker = () => {
		const input = document.getElementById('assets');
		const choose = document.getElementById('choose-assets');
		choose.scrollIntoView({block: 'center'});
		const bounds = choose.getBoundingClientRect();
		check(document.elementFromPoint(bounds.x + bounds.width / 2,
			      bounds.y + bounds.height / 2) === input,
			'choose-files clicks reach the native file input directly');
		input.focus();
		check(document.activeElement === input,
			'file input remains keyboard accessible');
	};
	const checkConversion = async () => {
		const original = OpenMHExtractionJob;
		let mode = 'success';
		OpenMHExtractionJob = class {
			async run(request, signal, progress, publish) {
				check(request.compact,
					'browser preparation compacts media by default');
				check(request.combinePatch,
					'browser requests a single patched package');
				progress({
					stage: 'prepare',
					operation: 'unpack',
					completed: 25,
					total: 100
				});
				check(activeImporter.progress.value === 0.25 &&
						activeImporter.progressView
							.label.textContent
							.includes('25%'),
					'measured preparation counts drive the percentage and bar');
				progress({
					stage: 'build',
					operation: 'write-package',
					completed: 5,
					total: 10
				});
				check(activeImporter.progress.value === 0.5 &&
						document.querySelector(
								'[data-stage="prepare"]')
								.dataset
								.state ===
							'complete' &&
						document.querySelector(
								'[data-stage="save"]')
								.dataset
								.state ===
							'waiting',
					'all stages show completed, active, and remaining work');
				progress({
					stage: 'export',
					operation: 'validate',
					completed: 0,
					total: 0
				});
				check(!activeImporter.progress.hidden &&
						!activeImporter.status
							.textContent &&
						!activeImporter.progress
							.hasAttribute('value'),
					'unknown-length checks remain indeterminate without terminal text');
				if (mode === 'failure')
					throw new Error('Conversion failed');
				if (mode === 'cancel') {
					activeImporter.abort();
					check(signal.aborted,
						'cancel reaches the conversion job');
					throw new DOMException(
						'Cancelled', 'AbortError');
				}
				const pending = publish(
					new File(['PREPARED'], 'game.ass'));
				check(!activeImporter.progress.hidden &&
						activeImporter.cancel.disabled,
					'progress remains active through publication');
				return pending;
			}
		};
		try {
			for (mode of ['failure', 'cancel', 'success']) {
				activeImporter.select(
					[new File(['SOURCE'], 'game.iso')]);
				await activeImporter.prepare();
				check(activeImporter.progress.hidden &&
						!activeImporter.busy,
					'progress ends after ' + mode);
				if (mode !== 'success')
					check(activeImporter.status
								.textContent &&
							!activeImporter.form
								.hidden,
						'failure and cancellation remain visible');
			}
			check(activeImporter.form.hidden &&
					packages.files.length === 1 &&
					!document
						.getElementById('prepared-game')
						.hidden &&
					document.querySelector(
							'#prepared-downloads a')
							.download ===
						'game.ass' &&
					new URL(document.getElementById(
								'play-prepared')
							.href)
							.searchParams.get(
								'content') ===
						packages.id,
				'completion offers Play, Download and the library for the saved game');
		} finally {
			OpenMHExtractionJob = original;
		}
	};
	const checkPeerChanges = async (downloads) => {
		const peer = document.createElement('iframe');
		peer.hidden = true;
		peer.src = document.getElementById('view-prepared').href;
		document.body.append(peer);
		try {
			await wait(
				() => peer.contentDocument
						?.getElementById('game-content')
						?.value === packages.id);
			const view = peer.contentDocument;
			const list = view.getElementById('package-files');
			const input = view.getElementById('add-packages');
			const transfer = new DataTransfer();
			transfer.items.add(new File(['TRACK'], 'extra.ass'));
			input.files = transfer.files;
			const url = downloads.querySelector('a').href;
			preparation.showTarget();
			input.dispatchEvent(new Event('change'));
			await wait(() => result.hidden &&
					packages.files.length === 2 &&
					list.children.length === 2);
			check(!activeImporter.updateGame &&
					await fetch(url).then(
						() => false, () => true),
				'an edit in another library view clears the pending update and revokes the old download');

			preparation.showPrepared();
			const current = downloads.querySelector('a').href;
			view.getElementById('forget-package').click();
			await wait(() => result.hidden);
			check(!downloads.childElementCount &&
					!packages.library.length &&
					await fetch(current).then(
						() => false, () => true),
				'deleting a game in another library view clears Play and revokes its download');
		} finally {
			peer.remove();
		}
	};

	const checkPreparation = () => {
		const drop = (...files) => {
			const transfer = new DataTransfer();
			for (const file of files)
				transfer.items.add(file);
			document.dispatchEvent(new DragEvent('drop', {
				dataTransfer: transfer,
				bubbles: true,
				cancelable: true
			}));
		};
		const base = new File(['DISC'], 'game.iso');
		const patch = new File(['UPDATE'], 'motorp30.exe');
		drop(base);
		check(!activeImporter.form.hidden &&
				document.activeElement ===
					activeImporter.form.querySelector(
						'h3') &&
				activeImporter.source.value === base.name,
			'dropping a base opens and focuses preparation');
		check(activeImporter.form.getBoundingClientRect().width ===
				document.querySelector('.package-upload')
					.getBoundingClientRect()
					.width,
			'preparation fills the conversion section width');
		drop(patch);
		check(activeImporter.source.value === base.name &&
				activeImporter.patch.value === patch.name &&
				activeImporter.files.includes(base) &&
				activeImporter.files.includes(patch),
			'adding a patch keeps the pending base instead of using remembered packages');
		check(activeImporter.request().files.length === 2 &&
				!activeImporter.start.disabled,
			'conversion receives both selected files');
		const replacement = new File(['NEW UPDATE'], 'motorp30.exe');
		const transfer = new DataTransfer();
		transfer.items.add(replacement);
		const input = document.getElementById('prepare-add-update');
		input.files = transfer.files;
		input.dispatchEvent(new Event('change'));
		check(activeImporter.files.length === 2 &&
				activeImporter.files.includes(replacement) &&
				activeImporter.files.includes(base),
			'update picker replaces a reselected patch without duplicating it');
		drop(new File(['OTHER DISC'], 'other.iso'));
		activeImporter.source.value = 'other.iso';
		activeImporter.patch.value = '';
		drop(new File(['TRACK'], 'track.bin'));
		check(activeImporter.source.value === 'other.iso' &&
				!activeImporter.patch.value,
			'adding companion files keeps the chosen base and no-update choice');
		const previous = activeImporter.files;
		drop(new File(['BAD'], 'same.bin'),
			new File(['BAD'], 'SAME.bin'));
		check(activeImporter.files === previous &&
				!activeImporter.start.disabled &&
				activeImporter.status.textContent.includes(
					'unique'),
			'invalid additions preserve the pending preparation');
		activeImporter.setBusy(true);
		check(input.disabled, 'conversion disables the update picker');
		activeImporter.setBusy(false);
		check(!input.disabled, 'conversion restores the update picker');
		activeImporter.abort();
		drop(new File(['BAD'], 'same.iso'),
			new File(['BAD'], 'SAME.iso'));
		check(!activeImporter.files.length &&
				!activeImporter.source.value &&
				activeImporter.start.disabled,
			'an invalid new preparation cannot reuse cancelled files');
		drop(new File(['NEW GAME'], 'fresh.exe'));
		check(activeImporter.files.length === 1 &&
				activeImporter.source.value === 'fresh.exe' &&
				!activeImporter.patch.value,
			'cancel starts the next preparation without previous files');
		activeImporter.abort();
	};
	try {
		const stage = sessionStorage.getItem('launch-stage') || 'home';
		const libraryNavigation =
			document.querySelector('.library-navigation');
		if (libraryNavigation) {
			check([...document.querySelectorAll(
				       '.site-navigation a')]
						.map((link) => link.textContent)
						.join('|') ===
					'Play|Game library|About',
				'library pages share the simplified top menu');
			const current = libraryNavigation.querySelectorAll(
				'[aria-selected="true"]');
			check(current.length === 1 &&
					!document
						.getElementById(
							current[0].getAttribute(
								'aria-controls'))
						.hidden,
				'the submenu selects one visible panel for ' +
					location.hash);
		}

		if (stage === 'home') {
			check(document.querySelector('h1').textContent ===
					'Motorhead',
				'landing explains the game: ' +
					document.querySelector('h1')
						.textContent);
			check(!document.querySelector(
				      'script[src="openmotor.js"]'),
				'landing does not load the engine');
			check(!performance.getEntriesByType('resource')
					.some((entry) => /\.(wasm|ass)$/.test(
						      entry.name)),
				'landing downloads no game assets');
			next('without-extractor', 'without-extractor/#prepare');
			return;
		}
		if (stage === 'default-home') {
			const play = document.querySelector('.hero-actions a');
			check(new URL(play.href).search === '',
				'home Play leaves the default game selection to the launcher');
			next('personal', play.href);
			return;
		}
		if (stage === 'mobile') {
			await wait(() => !document
					   .getElementById('mobile-unsupported')
					   .hidden);
			check(!document.querySelector('script[src="host.js"]'),
				'mobile restriction belongs to Play only');
			await fetch('/report', {
				method: 'POST',
				body: JSON.stringify({passed: true, checks})
			});
			return;
		}
		if (stage === 'without-extractor') {
			await packages.ready;
			activeImporter.select([new File(['disc'], 'game.iso')]);
			check(!activeImporter.form.hidden &&
					activeImporter.start.disabled,
				'an unavailable extractor explains the unsupported input');
			activeImporter.cancel.click();
			check(activeImporter.form.hidden &&
					!document.getElementById('assets')
						.disabled,
				'Cancel restores the file picker without an extractor');
			next('library-start', '/game-files/');
			return;
		}
		if (stage === 'library-start') {
			await packages.ready;
			check(location.hash === '#library' &&
					!document
						.getElementById('library-panel')
						.hidden &&
					document.getElementById('prepare-panel')
						.hidden,
				'the default library tab contains no visible upload controls');
			const original = packages;
			document.getElementById('prepare-tab').click();
			check(location.hash === '#prepare' &&
					!document
						.getElementById('prepare-panel')
						.hidden,
				'preparation uses a hash tab on the library page');
			activeImporter.select(
				[new File(['SOURCE'], 'pending.iso')]);
			document.getElementById('downloads-tab').click();
			check(location.hash === '#downloads' &&
					!document
						.getElementById(
							'downloads-panel')
						.hidden,
				'downloads uses a hash tab on the library page');
			const transfer = new DataTransfer();
			transfer.items.add(new File(['extra'], 'extra.iso'));
			for (const type of ['dragenter', 'drop'])
				document.dispatchEvent(new DragEvent(type, {
					dataTransfer: transfer,
					cancelable: true
				}));
			check(!document.querySelector('.package-upload')
						.classList.contains(
							'is-dragging') &&
					activeImporter.files.length === 1,
				'dropping on Downloads leaves the pending preparation alone');
			history.back();
			await wait(() => location.hash === '#prepare' &&
					!document
						.getElementById('prepare-panel')
						.hidden);
			check(packages === original &&
					activeImporter.source.value ===
						'pending.iso',
				'browser back restores preparation without losing selected files');
			history.forward();
			await wait(() => location.hash === '#downloads' &&
					!document
						.getElementById(
							'downloads-panel')
						.hidden);
			check(packages === original,
				'browser forward changes tabs without reloading');
			activeImporter.abort();
			next('prepare', '#prepare');
			return;
		}
		if (stage === 'prepare') {
			await packages.ready;
			check(document.getElementById('library-panel').hidden &&
					!document
						.getElementById('prepare-panel')
						.hidden,
				'preparation hides library management controls');
			document.getElementById('windows-guide-tab').click();
			check(location.hash === '#prepare-windows' &&
					!document
						.getElementById('windows-guide')
						.hidden,
				'native instructions have direct URLs');
			document.getElementById('browser-guide-tab').click();
			checkPicker();
			const input = document.getElementById('assets');
			activeImporter.setBusy(true);
			check(input.disabled,
				'conversion disables the native file picker');
			activeImporter.setBusy(false);
			check(!input.disabled,
				'file picker is restored after conversion');
			const transfer = new DataTransfer();
			transfer.items.add(
				new File(['PERSONAL BASE'], 'retail.ass'));
			transfer.items.add(new File(['PATCH'], 'patch30.ass'));
			const drag = (type) =>
				document.dispatchEvent(new DragEvent(type, {
					dataTransfer: transfer,
					bubbles: true,
					cancelable: true
				}));
			const area = document.querySelector('.package-upload');
			drag('dragenter');
			drag('dragenter');
			drag('dragleave');
			check(area.classList.contains('is-dragging'),
				'nested drag events keep the drop target highlighted');
			drag('dragleave');
			check(!area.classList.contains('is-dragging'),
				'leaving the page clears the drop highlight');
			drag('dragenter');
			const importCollection =
				packages.database.importCollection;
			packages.database.importCollection = () => {
				throw new Error(
					'A selected package went through extractor staging.');
			};
			drag('drop');
			check(!area.classList.contains('is-dragging'),
				'dropping files clears the highlight');
			await wait(() => !packages.busy);
			packages.database.importCollection = importCollection;
			check(location.pathname === '/game-files/' &&
					location.hash === '#prepare' &&
					activeImporter.form.hidden &&
					!result.hidden &&
					document.querySelectorAll(
							'#prepared-downloads a[download]')
							.length === 2,
				'packages import directly with Play and a download for each file');
			check(packages.library.length === 1,
				'a base and patch are stored together as one game');
			activeImporter.select([
				new File(['bad'], 'same.ass'),
				new File(['bad'], 'SAME.ass')
			]);
			await wait(
				() => document.getElementById('import-status')
					.textContent.includes('unique'));
			check(packages.files.length === 2,
				'invalid replacement preserves personal files');
			activeImporter.select([new File([], 'broken.ass')]);
			await wait(() => preparation.status.textContent ===
					'Invalid test package.');
			check((await packages.database.list()).length === 1 &&
					packages.files.length === 2,
				'rejected package contents preserve the existing library');
			const downloads =
				document.getElementById('prepared-downloads');
			const oldURL = downloads.querySelector('a').href;
			const list = document.getElementById('package-files');
			let rowsAdded = 0;
			const observer = new MutationObserver(changes => {
				for (const change of changes)
					rowsAdded += change.addedNodes.length;
			});
			observer.observe(list, {childList: true});
			await packages.removeFile('patch30.ass');
			observer.disconnect();
			check(rowsAdded === 1 && list.children.length === 1,
				'editing a collection renders its remaining file once');
			check(result.hidden && !downloads.childElementCount &&
					await fetch(oldURL).then(
						() => false, () => true),
				'editing the prepared game clears its result and revokes its old download');

			await preparation.finish(
				packages.files, true, packages.record);
			check(!result.hidden,
				'preparing the edited game publishes its current download');
			await checkPeerChanges(downloads);
			checkPreparation();
			await checkConversion();
			const library =
				document.getElementById('view-prepared');
			check(new URL(library.href)
						.searchParams.get('content') ===
					packages.id,
				'completion links to the prepared game in the library');
			const prepared = packages.id;
			content.select.value = 'builtin';
			content.select.dispatchEvent(new Event('change'));
			library.click();
			await wait(() => location.hash === '#library' &&
					packages.id === prepared);
			check(content.select.value === prepared,
				'View game library selects the completed game without a page reload');
			check(location.href === library.href,
				'the library URL identifies the prepared game');
			sessionStorage.setItem(
				'prepared-library', library.href);
			history.back();
			await wait(
				() => !document.getElementById('prepare-panel')
					.hidden);
			check(content.select.value === 'builtin',
				'Back restores the previous game selection');
			history.forward();
			await wait(
				() => !document.getElementById('library-panel')
					.hidden);
			check(location.href === library.href &&
					content.select.value === prepared,
				'Forward restores the prepared game');
			next('reload-prepared-library', location.href);
			return;
		}
		if (stage === 'reload-prepared-library') {
			await packages.ready;
			const saved = new URL(
				sessionStorage.getItem('prepared-library'));
			check(location.href === saved.href &&
					content.select.value ===
						saved.searchParams.get(
							'content'),
				'reloading the library keeps the prepared game selected');
			next('missing-update',
				'/without-demo/?content=deleted#prepare');
			return;
		}
		if (stage === 'missing-update') {
			await packages.ready;
			check(packages.library.length === 1 && !packages.id &&
					!activeImporter.updateGame &&
					preparation.status.textContent.includes(
						'no longer') &&
					!content.select.disabled,
				'a stale update link reports the missing game and leaves the other game unselected');
			activeImporter.select(
				[new File(['PATCH'], 'motorp30.exe')]);
			check(!activeImporter.source.value &&
					activeImporter.start.disabled,
				'a stale update link cannot pair the patch with another game');
			activeImporter.abort();
			document.getElementById('library-tab').click();
			content.select.value = packages.library[0].id;
			content.select.dispatchEvent(new Event('change'));
			check(!content.button.disabled &&
					!content.status.textContent,
				'the library accepts a new choice after a stale link');
			sessionStorage.setItem(
				'launch-stage', 'prepare-update');
			sessionStorage.setItem(
				'launch-checks', JSON.stringify(checks));
			document.getElementById('prepare-package').click();
			return;
		}
		if (stage === 'prepare-update') {
			await packages.ready;
			const id = packages.id;
			check(new URL(location.href)
						.searchParams.get('content') ===
					id,
				'opening Prepare update links to the newly selected game');
			check(packages.file?.name === 'game.ass' &&
					!document
						.getElementById(
							'prepare-target')
						.hidden,
				'update preparation restores the explicitly selected library game');
			await packages.database.writeCollection(
				[new File(['another'], 'another.ass')],
				'other');
			await packages.refresh('other');
			check(packages.file.name === 'another.ass',
				'a different library game can be selected during update preparation');
			activeImporter.select(
				[new File(['PATCH'], 'motorp30.exe')]);
			check(activeImporter.source.value === 'game.ass' &&
					activeImporter.patch.value ===
						'motorp30.exe' &&
					activeImporter.target?.id === id,
				'update installer is paired with its saved base game');
			activeImporter.abort();
			await packages.database.remove('other');
			activeImporter.select(
				[new File(['PATCH'], 'motorp30.exe')]);
			check(!activeImporter.source.value &&
					activeImporter.start.disabled,
				'a standalone patch requires an explicit base game');
			activeImporter.abort();
			check((await packages.database.read(
				       id)).files.length === 1,
				'cancelling an update keeps the library game intact');
			next('guide',
				sessionStorage.getItem('prepared-library'));
			return;
		}
		if (stage === 'guide') {
			await packages.ready;
			await wait(() => packages.file?.name === 'game.ass');
			check(content.select.value === packages.id,
				'library selects the newly prepared game across page navigation');
			await packages.database.remove(packages.id);
			await packages.refresh();
			check(!document.querySelector(
				      'script[src="openmotor.js"]'),
				'guide uses only storage and extraction services');
			check(content.select.querySelector(
				      'option[value="builtin"]') &&
					document.getElementById(
							'remembered-package')
						.hidden,
				'built-in demo is selectable without personal removal controls');
			const id = crypto.randomUUID();
			await packages.database.writeCollection(
				[new File(['STORED'], 'stored.ass')], id);
			const libraries = await Promise.all([
				packages.database.list(),
				packages.database.list()
			]);
			check(libraries.every((games) => games.length === 1 &&
					      games[0].id === id),
				'concurrent library reads preserve the explicit game ID');
			check(await libraries[0][0].files[0].blob.text() ===
					'STORED',
				'library reads preserve stored game bytes');
			const firstView = new OpenMHPackageStore();
			const secondView = new OpenMHPackageStore();
			await Promise.all(
				[firstView.restore(), secondView.restore()]);
			await firstView.saveFiles(
				[
					...firstView.files,
					new File(['TRACK A'], 'track-a.ass')
				],
				firstView.record);
			let conflict;
			try {
				await secondView.saveFiles(
					[
						...secondView.files,
						new File(['TRACK B'],
							'track-b.ass')
					],
					secondView.record);
			} catch (error) {
				conflict = error;
			}
			check(conflict &&
					(await packages.database.read(id))
						.files.some(
							entry => entry.name ===
								'track-a.ass'),
				'a stale library view cannot overwrite a saved track');
			await packages.database.remove(id);
			await packages.storePrepared([
				new File(['PERSONAL BASE'], 'retail.ass'),
				new File(['PATCH'], 'patch30.ass')
			]);
			check(content.select.options.length === 2,
				'personal packages coexist with the protected demo');
			const addFiles =
				document.getElementById('add-packages');
			check(addFiles.accept === '.ass',
				'library accepts prepared updates and tracks');
			check(new URL(document.getElementById('prepare-package')
					      .href)
						.searchParams.get('content') ===
					packages.id,
				'preparing an update links to the selected library game');
			const retail = packages.id;
			sessionStorage.setItem('retail-game', retail);
			await packages.storePrepared(
				new File(['PERSONAL DEMO'], 'retail.ass'));
			const demo = packages.id;
			sessionStorage.setItem('demo-game', demo);
			check(retail !== demo &&
					content.select.options.length === 3,
				'converting another game keeps both imports and the built-in demo, even with matching filenames');
			check(await OpenMHPackageDatabase
						.entries(await packages.database
								.read(retail))
							[0]
						.blob.text() ===
					'PERSONAL BASE',
				'new conversion preserves the original game bytes');
			content.select.value = retail;
			content.select.dispatchEvent(new Event('change'));
			check(packages.files.length === 2 &&
					packages.id === retail,
				'selecting an earlier game restores its own file controls');
			await addPackages(
				[
					...packages.files,
					new File([], 'invalid.ass')
				],
				packages.record);
			check(packages.status.textContent ===
						'Invalid test package.' &&
					(await packages.database.read(retail))
							.files.length === 2,
				'invalid appended content keeps the selected collection intact');
			await packages.removeFile('retail.ass');
			check((await packages.database.read(
				       retail)).files.length === 2,
				'removing a base cannot leave a patch as the only game file');
			const extra = new DataTransfer();
			extra.items.add(new File(['TRACK'], 'track.ass'));
			addFiles.files = extra.files;
			addFiles.dispatchEvent(new Event('change'));
			await wait(() => !packages.busy &&
					packages.files.length === 3);
			check(packages.id === retail &&
					packages.library.length === 2,
				'adding a track updates only the selected library game');
			await packages.removeFile('track.ass');
			check(await OpenMHPackageDatabase
						.entries(await packages.database
								.read(demo))[0]
						.blob.text() ===
					'PERSONAL DEMO',
				'updating and removing overlays preserves other games');
			content.select.value = demo;
			content.select.dispatchEvent(new Event('change'));
			document.getElementById('default-content').click();
			check(content.defaultValue() === demo,
				'an imported game can become the default');
			content.select.value = retail;
			content.select.dispatchEvent(new Event('change'));
			document.getElementById('default-content').click();
			check(content.defaultValue() === retail &&
					document.getElementById(
							'default-content')
						.disabled,
				'the default can be changed to a game with overlays');
			next('original-picker', '../play/?choose-package=1');
			return;
		}
		if (stage === 'original-picker' || stage === 'bundled-picker' ||
			stage === 'direct-picker') {
			await wait(() => typeof packages !== 'undefined' &&
					!launcher.hidden);
			document.getElementById('launcher-settings-tab')
				.click();
			if (stage === 'original-picker') {
				importer.setBusy(true);
				saveTools.exportButton.click();
				const backup = new DataTransfer();
				backup.items.add(
					new File(['backup'], 'test.omsave'));
				saveTools.importInput.files = backup.files;
				saveTools.importInput.dispatchEvent(
					new Event('change'));
				check(!saveTools.busy &&
						document.getElementById(
								'assets')
							.disabled,
					'game preparation blocks backup export and import');
				importer.setBusy(false);
				check(!document.getElementById('assets')
						.disabled,
					'finishing preparation enables the file picker');
			}
			document.getElementById('frontend').value = 'original';
			document.getElementById('play-tab').click();
			const bundled = stage === 'bundled-picker';
			content.select.value = bundled
				? 'builtin'
				: sessionStorage.getItem('retail-game');
			content.select.dispatchEvent(new Event('change'));
			const direct = stage === 'direct-picker';
			if (!direct) {
				sessionStorage.setItem('launch-checks',
					JSON.stringify(checks));
				sessionStorage.setItem('launch-stage',
					bundled ? 'original-builtin'
						: 'original-personal');
				content.button.click();
				return;
			}
			packages.playButton.click();
		}
		if (stage === 'original-personal' ||
			stage === 'original-builtin' ||
			stage === 'direct-picker') {
			await wait(() => !!window.fixtureFrontend);
			check(window.fixtureFrontend === 'original' &&
					raceView.dialog.open &&
					fixtureMounts[0].text ===
						(stage === 'original-builtin'
								? 'BUILT-IN DEMO'
								: 'PERSONAL BASE'),
				'the chosen package starts in the original menus: ' +
					stage);
			const notices = document.getElementById('race-notices');
			check(!notices.getClientRects().length,
				'the original menus start without a filename overlay');
			suspensionChanged({paused: true, reason: 'user'});
			check(notices.getClientRects().length &&
					status.textContent === 'Paused',
				'the original menus still show pause notices');
			suspensionChanged({paused: false});
			check(!notices.getClientRects().length,
				'resuming clears the original-menu overlay');
			reportStorageError('Save interrupted');
			retryStorage.click();
			check(!notices.getClientRects().length,
				'a successful save retry clears the original-menu overlay');
			gameExited(0);
			if (stage === 'original-personal')
				next('bundled-picker', '?choose-package=1');
			else if (stage === 'original-builtin')
				next('direct-picker', '?choose-package=1');
			else
				next('builtin', '?content=builtin');
			return;
		}
		if (stage === 'builtin') {
			await wait(() => !!window.fixtureFinishDownload);
			const download =
				document.getElementById('asset-download');
			check(download.getBoundingClientRect().height >=
					innerHeight * 0.5,
				'demo download occupies the main content area');
			check(document.querySelector('.site-header')
						.getClientRects()
						.length > 0,
				'site navigation remains visible during the download');
			check(
				[
					'launcher',
					'package-tools',
					'race-setup',
					'save-tools'
				].every((id) => !document.getElementById(id)
						.getClientRects()
						.length),
				'game and package controls stay hidden during the download');
			check(document.getElementById('asset-download-size')
					.textContent.includes('50%'),
				'the main download view displays live progress');
			window.fixtureFinishDownload();
		}
		await wait(
			() => typeof raceSetup !== 'undefined' && !!raceSetup);
		await packages.ready;
		raceSetup.selectTab('settings-panel');
		if (stage === 'builtin') {
			check(document.getElementById('asset-download')
						.hidden &&
					!document.getElementById('race-setup')
						.hidden,
				'game controls replace the download after loading');
			check(fixtureMounts.length === 1 &&
					fixtureMounts[0].text ===
						'BUILT-IN DEMO',
				'demo selection mounts only deployment assets');
			check(packages.library.length === 2 &&
					!packages.files.length,
				'playing the built-in demo preserves both personal games without exposing their removal controls');
			const settings =
				document.getElementById('settings-panel');
			check(settings.contains(saveTools.section) &&
					!settings.contains(content.select) &&
					picker.contains(content.select) &&
					!content.select.getClientRects().length,
				'Settings shows save tools and keeps the game library out of view');
			const previousStatus = packages.status.textContent;
			const update = new DataTransfer();
			update.items.add(new File(['PATCH'], 'motorp30.exe'));
			document.dispatchEvent(new DragEvent('drop', {
				dataTransfer: update,
				bubbles: true,
				cancelable: true
			}));
			check(importer.form.hidden &&
					packages.status.textContent ===
						previousStatus,
				'Settings ignores file drops while the upload area is hidden');
			player.networkState('lobby');
			check(saveTools.section.hidden,
				'save controls are unavailable while connected');
			document.querySelector(
					'.site-navigation a[href="game-files/"]')
				.click();
			check(raceSetup.navigationNotice.open &&
					location.pathname === '/play/',
				'site navigation respects active multiplayer connections');
			await player.leaveServer();
			check(content.defaultValue() ===
					sessionStorage.getItem('retail-game'),
				'playing the demo does not replace the chosen default');
			next('default-home', '../');
			return;
		}
		if (stage === 'personal') {
			check(fixtureMounts.length === 2 &&
					fixtureMounts[0].text ===
						'PERSONAL BASE' &&
					fixtureMounts[1].text === 'PATCH',
				'personal selection mounts its own base and overlay without the demo');
			check(content.select.value ===
					sessionStorage.getItem('retail-game'),
				'home Play loads the saved default after storage restoration');
			await packages.removeFile('patch30.ass');
			check(packages.files.length === 1 &&
					content.select.querySelector(
						'option[value="builtin"]'),
				'removing an overlay keeps the base and built-in demo');
			await packages.removeFile('retail.ass');
			check(packages.files.length === 0 &&
					content.select.value === 'builtin',
				'removing all personal files falls back to the built-in demo');
			next('demo',
				'?content=' +
					sessionStorage.getItem('demo-game'));
			return;
		}
		if (stage === 'demo') {
			check(fixtureMounts.length === 1 &&
					fixtureMounts[0].text ===
						'PERSONAL DEMO',
				'the second imported game remains independently playable after deleting the first');
			await packages.removeFile('retail.ass');
			check(packages.library.length === 0 &&
					content.select.value === 'builtin',
				'deleting the final personal game preserves the built-in demo');
			next('fallback', '../play/');
			return;
		}
		if (stage === 'reset-ready') {
			await packages.database.writeCollection(
				[new File(['KEEP'], 'keep.ass')], 'reset-one');
			await packages.database.writeCollection(
				[new File(['KEEP TWO'], 'keep-two.ass')],
				'reset-two');
			document.getElementById('reset-data').click();
			for (const input of saveTools.resetChoices())
				input.checked = input.name === 'history';
			saveTools.updateResetSelection();
			sessionStorage.setItem('launch-stage', 'reset-saved');
			sessionStorage.setItem(
				'launch-checks', JSON.stringify(checks));
			document.getElementById('reset-confirm').click();
			return;
		}
		if (stage === 'reset-saved') {
			check(location.hash === '#settings' &&
					!document
						.getElementById(
							'settings-panel')
						.hidden,
				'reset reloads the Settings page even when its URL was already selected');
			check(sessionStorage.getItem('reset-categories') ===
						'["history"]' &&
					(await packages.database.list())
							.length === 2,
				'history-only reset sends only history to the runtime and preserves uploaded games');
			document.getElementById('reset-data').click();
			document.getElementById('reset-all').click();
			sessionStorage.setItem('reset-denied', '1');
			document.getElementById('reset-confirm').click();
			await wait(() => !saveTools.busy);
			check(saveTools.resetDialog.open &&
					saveTools.resetStatus.textContent.includes(
						'Added game files were removed') &&
					(await packages.database.list())
							.length === 0,
				'partial reset failure identifies completed package deletion and leaves a retry available');
			sessionStorage.removeItem('reset-denied');
			sessionStorage.setItem(
				'launch-stage', 'reset-all-saved');
			sessionStorage.setItem(
				'launch-checks', JSON.stringify(checks));
			document.getElementById('reset-confirm').click();
			return;
		}
		if (stage === 'reset-all-saved') {
			check(sessionStorage.getItem('reset-categories') ===
						'["settings","controls","progress","history"]' &&
					(await packages.database.list())
							.length === 0,
				'select all resets every save category and all uploaded collections');
			check(content.select.value === 'builtin' &&
					fixtureMounts[0].text ===
						'BUILT-IN DEMO',
				'complete reset reloads the built-in demo');
			const backup = await OpenMHBackup.encode(
				{version: 1, entries: []});
			window.confirm = () => true;
			window.addEventListener('beforeunload', event => {
				sessionStorage.setItem('import-prompt',
					String(event.defaultPrevented));
			});
			sessionStorage.setItem(
				'launch-stage', 'backup-restored');
			sessionStorage.setItem(
				'launch-checks', JSON.stringify(checks));
			await saveTools.run(() => saveTools.import(backup));
			return;
		}
		if (stage === 'backup-restored') {
			check(sessionStorage.getItem('imported-backup') ===
						'1' &&
					sessionStorage.getItem(
						'import-prompt') === 'false',
				'importing a confirmed save reloads without the unload prompt');
			next('mobile', '?content=builtin&mobile=1');
			return;
		}
		check(fixtureMounts.length === 1 &&
				fixtureMounts[0].text === 'BUILT-IN DEMO',
			'missing personal content reloads the built-in demo');
		check(packages.files.length === 0,
			'the built-in demo never enters deletable package storage');
		next('reset-ready', '?content=builtin#settings');
	} catch (error) {
		await fetch('/report', {
			method: 'POST',
			body: JSON.stringify({
				passed: false,
				error: String(error) + '\n' + error.stack,
				checks
			})
		});
	}
}

checkLaunch();
