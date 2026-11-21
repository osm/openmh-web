'use strict';

const checks = [];
const networkFetch = window.fetch;
const section = document.getElementById('asset-download');
const view = new OpenMHDownloadProgress(section);

function check(value, message) {
	if (!value)
		throw new Error(message);
	checks.push(message);
}

async function waitFor(predicate) {
	const deadline = performance.now() + 5000;
	while (!predicate()) {
		if (performance.now() > deadline)
			throw new Error('Progress timed out.');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function responseStream(headers = {}) {
	let controller;
	const response = new Response(new ReadableStream({
		start(output) {
			controller = output;
		}
	}),
		{headers});
	window.fetch = async () => response;
	return controller;
}

async function knownLength() {
	const stream = responseStream({'Content-Length': '4'});
	const pending = view.download('/game.ass');
	check(!section.hidden,
		'download panel appears before the response arrives');
	stream.enqueue(new Uint8Array([1, 2]));
	await waitFor(() => view.bar.value === 2);
	check(view.bar.max === 4 && view.details.textContent.includes('50%'),
		'progress reports a partial download before completion');
	stream.enqueue(new Uint8Array([3, 4]));
	stream.close();
	const blob = await pending;
	check(String(new Uint8Array(await blob.arrayBuffer())) === '1,2,3,4',
		'progress preserves the exact downloaded bytes');
	check(section.hidden && view.bar.position === 1,
		'finished download hides the completed bar');
}

async function unknownLength(headers, description) {
	const stream = responseStream(headers);
	const pending = view.download('/game.ass');
	stream.enqueue(new Uint8Array([128, 255]));
	await waitFor(() => view.details.textContent === '2 B downloaded');
	check(view.bar.position === -1,
		description + ' shows bytes without an invented percentage');
	stream.close();
	await pending;
	check(section.hidden, description + ' completes normally');
}

async function failedDownload() {
	window.fetch = async () => new Response('missing', {status: 404});
	let message = '';
	try {
		await view.download('/missing.ass');
	} catch (error) {
		message = error.message;
	}
	check(message.includes('404') && section.hidden,
		'HTTP errors hide the progress bar and retain the status code');

	const stream = responseStream({'Content-Length': '8'});
	const pending = view.download('/broken.ass');
	stream.enqueue(new Uint8Array([1, 2]));
	stream.error(new Error('Connection interrupted'));
	message = '';
	try {
		await pending;
	} catch (error) {
		message = error.message;
	}
	check(message && section.hidden && view.bar.position !== 1,
		'interrupted transfers fail without reporting completion');
}

async function embeddingAPI() {
	window.fetch = async () => new Response(new Uint8Array([6, 7, 8]));
	const bytes = await OpenMH.download('/game.ass');
	check(bytes instanceof ArrayBuffer &&
			String(new Uint8Array(bytes)) === '6,7,8',
		'embedding API keeps its ArrayBuffer result');
}

(async () => {
	try {
		await knownLength();
		await unknownLength({}, 'unknown length');
		await unknownLength(
			{'Content-Encoding': 'gzip', 'Content-Length': '1'},
			'compressed response');
		await unknownLength(
			{'Content-Length': '1'}, 'understated length');
		await failedDownload();
		await embeddingAPI();
		await networkFetch('/report', {
			method: 'POST',
			body: JSON.stringify({passed: true, checks})
		});
	} catch (error) {
		await networkFetch('/report', {
			method: 'POST',
			body: JSON.stringify({
				passed: false,
				checks,
				error: error.stack || String(error)
			})
		});
	} finally {
		window.fetch = networkFetch;
	}
})();
