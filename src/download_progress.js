'use strict';

class OpenMHDownloadProgress {
	constructor(section) {
		this.section = section;
		this.bar = section.querySelector('progress');
		this.details = section.querySelector('[data-download-size]');
	}

	static size(bytes) {
		if (bytes < 1024)
			return bytes + ' B';
		if (bytes < 1024 * 1024)
			return (bytes / 1024).toFixed(1) + ' KiB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
	}

	update(received, total) {
		const amount = OpenMHDownloadProgress.size(received);
		if (total > 0) {
			this.bar.max = total;
			this.bar.value = received;
			const percentage = Math.floor((received / total) * 100);
			this.details.textContent = amount + ' / ' +
				OpenMHDownloadProgress.size(total) + ' · ' +
				percentage + '%';
		} else {
			this.bar.removeAttribute('value');
			this.details.textContent = amount + ' downloaded';
		}
	}

	async download(url) {
		this.update(0, 0);
		this.section.hidden = false;
		try {
			return await OpenMH.downloadBlob(url,
				(received, total) =>
					this.update(received, total));
		} catch (error) {
			if (error instanceof TypeError)
				throw new Error(
					error.message.replace(/\.$/, '') +
					'. If you use an ad blocker or privacy extension, try disabling it for this site.');
			throw error;
		} finally {
			this.section.hidden = true;
		}
	}
}
