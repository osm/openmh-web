"""Prepare the curated original-game downloads without checking in binaries."""

import html
from pathlib import Path

if __package__:
	from .checksum import file_sha256
else:
	from checksum import file_sha256

CATALOG = {
	'DEMOS': ('demo', (
		('MPlayer demo', 'motordemo_mplayer.exe'),
		('Software demo', 'motordemo_soft.exe'),
		('Software demo with intro', 'motordemo_soft_intro.exe'),
		('3dfx demo', 'motordemo_3dfx.exe'),
		('3dfx demo with intro', 'motordemo_3dfx_intro.exe'),
		('Demo 2: software', 'motordemo2_soft.exe'),
		('Demo 2: 3dfx with intro', 'motordemo2_3dfx_intro.exe'),
	)),
	'PATCHES': ('patches', (
		('Patch 3.0', 'motorp30.exe'),
		('Patch 3.1: European edition', 'motorp31.exe'),
		('Patch 2.2', 'motorp22.exe'),
		('Patch 2.1', 'motorp21.exe'),
		('Patch 1.4', 'motorp14.exe'),
		('Patch 1.3', 'motorp13.exe'),
	)),
}


def download_row(title, filename, size, digest):
	title, filename = html.escape(title), html.escape(filename, quote=True)

	return (f'<li><div><strong>{title}</strong>'
		f'<span>{filename} · {size / (1024 * 1024):.1f} MiB</span>'
		f'<details class="download-checksum"><summary>SHA-256</summary>'
		f'<code>{digest}</code></details></div>'
		f'<a class="button" href="downloads/files/{filename}" download="{filename}" '
		f'aria-label="Download {title}">Download ↓</a></li>')


def prepare(root):
	"""Validate every requested source before the builder modifies its output."""

	sources, binaries, values = {}, {}, {}
	checksums = []

	for token, (folder, entries) in CATALOG.items():
		if root is None:
			values[token] = '<p>Downloads are not included in this deployment.</p>'
			continue

		rows = []

		for title, filename in entries:
			source = Path(root) / folder / filename

			if not source.is_file():
				raise ValueError(f'Missing download source: {source}')

			sources['downloads/files/' + filename] = source
			size = source.stat().st_size
			digest = file_sha256(source).hex()

			checksums.append(f'{digest}  {filename}\n')
			rows.append(download_row(title, filename, size, digest))

		values[token] = '<ul class="download-list">' + ''.join(rows) + '</ul>'

	if checksums:
		binaries['downloads/files/SHA256SUMS'] = ''.join(checksums).encode('ascii')

	return sources, binaries, values
