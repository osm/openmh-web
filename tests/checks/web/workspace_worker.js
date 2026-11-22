'use strict';

importScripts('openmotorex.js', 'extract-workspace.js');

self.onmessage = async () => {
	const checks = [];
	let handle;
	const check = (value, message) => {
		if (!value)
			throw new Error(message);
		checks.push(message);
	};
	try {
		const module = await createOpenMHExtractor();
		const root = await navigator.storage.getDirectory();
		const file = await root.getFileHandle(
			'workspace-test', {create: true});
		handle = await file.createSyncAccessHandle();
		handle.truncate(0);
		const workspace = new OpenMHWorkspace(module, handle);
		workspace.mount('/work');
		const fs = module.FS;
		const stream = fs.open('/work/sparse', 'w+');
		const pattern = Uint8Array.from(
			{length: 170000}, (_, index) => index % 251);
		fs.write(stream, pattern, 0, pattern.length, 65530);
		const data = fs.readFile('/work/sparse');
		check(data.length === 235530 &&
				data.subarray(0, 65530).every(
					(value) => value === 0),
			'sparse gaps are zero');
		check(data.subarray(65530).every(
			      (value, index) => value === pattern[index]),
			'reads and writes cross page boundaries');
		fs.truncate('/work/sparse', 65533);
		fs.truncate('/work/sparse', 170000);
		check(fs.readFile('/work/sparse')
				.subarray(65533)
				.every((value) => value === 0),
			'truncate and extend cannot expose old bytes');
		fs.writeFile('/work/new', new Uint8Array([7, 8, 9]));
		fs.rename('/work/new', '/work/sparse');
		const old = new Uint8Array(3);
		fs.read(stream, old, 0, 3, 65530);
		check(String(old) === '0,1,2' &&
				String(fs.readFile('/work/sparse')) === '7,8,9',
			'replacement keeps the old open inode readable');
		fs.close(stream);
		const held = fs.open('/work/sparse', 'r');
		fs.unlink('/work/sparse');
		fs.read(held, old, 0, 3, 0);
		check(String(old) === '7,8,9', 'unlink keeps open data alive');
		fs.close(held);
		fs.writeFile('/work/reused', new Uint8Array([42]));
		fs.truncate('/work/reused', 65536);
		check(fs.readFile('/work/reused')
				.subarray(1)
				.every((value) => value === 0),
			'reused pages are cleared');
		check(workspace.next <= 5, 'released disk pages are reused');
		const actual = workspace.handle;
		workspace.handle = {
			write() {
				throw new DOMException(
					'injected', 'QuotaExceededError');
			}
		};
		let failed = false;
		try {
			fs.writeFile('/work/full', new Uint8Array([1]));
		} catch {
			failed = true;
		}
		check(failed && workspace.failure.includes('storage is full'),
			'quota failures propagate through the filesystem');
		workspace.handle = actual;
		handle.close();
		handle = null;
		await root.removeEntry('workspace-test');
		postMessage({passed: true, checks});
	} catch (error) {
		postMessage({
			passed: false,
			checks,
			error: error.stack || String(error)
		});
	} finally {
		handle?.close();
	}
};
