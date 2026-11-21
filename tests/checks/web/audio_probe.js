'use strict';

// Observe the actual output graph without relaxing the browser's autoplay policy.
const audioProbe = {
	contexts: [],
	analysers: [],
	peak: 0,
	resumes: []
};
const originalResume = AudioContext.prototype.resume;
AudioContext.prototype.resume = function(...args) {
	const attempt = {
		active: navigator.userActivation?.isActive,
		result: 'pending'
	};
	audioProbe.resumes.push(attempt);
	if (audioProbe.resumes.length > 10)
		audioProbe.resumes.shift();
	const pending = originalResume.apply(this, args);
	pending.then(
		() => {
			attempt.result = this.state;
		},
		(error) => {
			attempt.result = String(error);
		});
	return pending;
};
const originalConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function(destination, ...ports) {
	if (!(destination instanceof AudioDestinationNode))
		return originalConnect.call(this, destination, ...ports);
	const analyser = this.context.createAnalyser();
	audioProbe.contexts.push(this.context);
	audioProbe.analysers.push(analyser);
	originalConnect.call(analyser, destination);
	return originalConnect.call(this, analyser, ...ports);
};
setInterval(() => {
	for (const analyser of audioProbe.analysers) {
		const samples = new Float32Array(analyser.fftSize);
		analyser.getFloatTimeDomainData(samples);
		for (const sample of samples)
			audioProbe.peak =
				Math.max(audioProbe.peak, Math.abs(sample));
	}
}, 20);
