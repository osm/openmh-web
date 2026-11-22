#!/usr/bin/env python3
"""Check remembered asset packages across page reloads in a private browser.

Uses tiny synthetic files and the real host, IndexedDB and Wasm filesystem.
Only the game entry point is replaced: these files are not playable assets.
"""

import argparse
import re
from pathlib import Path

from tests.checks.support.browser import run_browser
from tests.checks.support.build import build_executable


def resources(build):
	target = build_executable(build, 'openmotor')
	result = {'/openmotor.js': (target.read_bytes(), 'text/javascript'),
		'/openmotor.wasm': (target.with_suffix('.wasm').read_bytes(), 'application/wasm')}

	for source in build.glob('*.js'):
		result['/' + source.name] = (source.read_bytes(), 'text/javascript')

	result['/style.css'] = ((build / 'style.css').read_bytes(), 'text/css')

	page = (build / 'play/index.html').read_text().replace(
		'</body>', '<script>document.getElementById("frontend").value="original";</script>'
		'<script src="check.js"></script></body>')
	page = re.sub(r'(<meta\s+name="openmh-assets"\s+content=")[^"]*', r'\1', page)
	result['/'] = (page.encode(), 'text/html')
	result['/check.js'] = (Path(__file__).with_name('browser_packages.js').read_bytes(),
		'text/javascript')
	page, mime = result['/']
	page = page.replace(b'<script src="startup.js"></script>',
		b'<script src="test_runtime.js"></script><script src="host.js"></script>')
	result['/'] = (page, mime)
	result['/test_runtime.js'] = (Path(__file__).with_name('test_runtime.js').read_bytes(), 'text/javascript')

	return result


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--executable')
	args = parser.parse_args()
	report = run_browser(resources(args.build), args.output, args.browser, args.executable)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} package storage checks passed')


if __name__ == '__main__':
	main()
