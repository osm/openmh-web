#!/usr/bin/env python3
"""Check asset download bytes, progress and errors with controlled browser streams."""

import argparse
from pathlib import Path

from tests.checks.support.browser import run_browser


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	args = parser.parse_args()
	page = (args.build / 'play/index.html').read_text()
	start = page.index('<div id="asset-download"')
	end = page.index('</div>', start) + len('</div>')
	page = ('<!doctype html><meta charset="utf-8">' + page[start:end] +
		'<script src="/player.js"></script>'
		'<script src="/download_progress.js"></script><script src="/check.js"></script>')
	resources = {'/': (page.encode(), 'text/html')}

	for name in ('player.js', 'download_progress.js'):
		resources['/' + name] = ((args.build / name).read_bytes(), 'text/javascript')

	resources['/check.js'] = (Path(__file__).with_name('browser_download.js').read_bytes(),
		'text/javascript')
	report = run_browser(resources, args.output, args.browser)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} download checks passed')


if __name__ == '__main__':
	main()
