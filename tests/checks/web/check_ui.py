#!/usr/bin/env python3
"""Check real UI controls with synthetic catalogs and a public API test double.

Requires a browser only: no engine build, Wasm, game installation or .ass files.
"""

import argparse
from pathlib import Path

from tests.checks.support.browser import run_browser
from tools.pages import render

ROOT = Path(__file__).resolve().parents[3]


def resources():
	page = render('index.html', {'BASE_URL': '/', 'CONTENT_LABEL': 'Built-in demo'})

	for token in ['RUNTIME_SCRIPTS', 'EXTRACTOR_URL', 'ASSET_URL']:
		page = page.replace('@' + token + '@', '')

	page = page.replace('@UNLOCK_ALL@', '0')
	page = page.replace('@MULTIPLAYER@', '{}')
	page = page.replace('<script src="startup.js"></script>',
		'<script src="test_player.js"></script><script src="ui.js"></script>')
	content = {'/': (page.encode(), 'text/html'),
		'/style.css': ((ROOT / 'src/style.css').read_bytes(), 'text/css')}

	for source in (ROOT / 'src').glob('*.js'):
		content['/' + source.name] = (source.read_bytes(), 'text/javascript')

	for name in ('test_player.js', 'ui.js'):
		content['/' + name] = (Path(__file__).with_name(name).read_bytes(), 'text/javascript')

	return content


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--executable')
	args = parser.parse_args()
	report = run_browser(resources(), args.output, args.browser, args.executable)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} asset-free UI checks passed')


if __name__ == '__main__':
	main()
