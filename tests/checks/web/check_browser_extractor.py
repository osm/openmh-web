#!/usr/bin/env python3
"""Check browser extraction storage, cancellation and optional real-source parity.

Supply --source, --companion (repeatable), --patch and a native --expected package
for an end-to-end import. With --patch, --expected must be the combined game
package, built with --compact to match browser preparation. Original assets
remain outside source control.
"""

import argparse
import json
from pathlib import Path
import zipfile

from tests.checks.support.browser import run_browser
from tests.checks.web.check_browser_packages import resources


def fixture(args):
	content = resources(args.build)

	for name in ('openmotorex.js', 'openmotorex.wasm', 'extract-worker.js',
		'extract-workspace.js'):
		mime = 'application/wasm' if name.endswith('.wasm') else 'text/javascript'
		content['/' + name] = ((args.build / name).read_bytes(), mime)

	for name in ('browser_extractor.js', 'workspace_worker.js'):
		content['/' + name] = (Path(__file__).with_name(name).read_bytes(), 'text/javascript')

	page, mime = content['/']
	page = page.replace(b'<script src="check.js"></script>', b'<script src="browser_extractor.js"></script>')
	content['/'] = (page, mime)
	files = ([args.source] if args.source else []) + args.companion + ([args.patch] if args.patch else [])
	config = {'files': [], 'source': args.source.name if args.source else '',
		'excludeMusic': args.exclude_music, 'excludeMovies': args.exclude_movies,
		'patch': bool(args.patch)}

	for index, path in enumerate(files):
		url = f'/input-{index}'
		content[url] = (path.read_bytes(), 'application/octet-stream')
		config['files'].append({'name': path.name, 'url': url})

	if args.expected:
		with zipfile.ZipFile(args.expected) as archive:
			config['entries'] = {entry.filename: [entry.CRC, entry.file_size]
				for entry in archive.infolist()}
			config['media'] = [
				name for name in archive.namelist()
				if (name.lower().startswith('music/') and name.lower().endswith('.opus'))
				or (name.lower().startswith('movies/') and name.lower().endswith('.pak'))
			]

	content['/fixture.json'] = (json.dumps(config).encode(), 'application/json')

	return content


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--source', type=Path)
	parser.add_argument('--companion', type=Path, action='append', default=[])
	parser.add_argument('--patch', type=Path)
	parser.add_argument('--expected', type=Path)
	parser.add_argument('--exclude-music', action='store_true')
	parser.add_argument('--exclude-movies', action='store_true')
	args = parser.parse_args()

	if bool(args.source) != bool(args.expected):
		parser.error('--source and --expected must be supplied together')

	report = run_browser(fixture(args), args.output, args.browser, timeout=600)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} extractor checks passed')


if __name__ == '__main__':
	main()
