'use strict';

function isMobileDevice() {
	if (navigator.userAgentData?.mobile)
		return true;
	if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
		return true;

	// iPadOS can identify as a Mac when requesting desktop websites.
	return (navigator.platform === 'MacIntel' &&
		navigator.maxTouchPoints > 1);
}

function startWebsite() {
	if (isMobileDevice()) {
		document.getElementById('mobile-unsupported').hidden = false;
		return;
	}

	const host = document.createElement('script');
	host.src = new URL('host.js', document.currentScript.src).href;
	document.body.append(host);
}

startWebsite();
