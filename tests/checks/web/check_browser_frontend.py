#!/usr/bin/env python3
"""Check the web race form/API, repeated sessions, pause, results and saved preferences.

Uses the normal host with the test-only AI driver and a retail package.
"""

import argparse
from pathlib import Path

from tests.checks.support.browser import run_browser
from tests.checks.web.check_single_player import fixture


def scenario_script(args):
	if args.bundled:
		return 'browser_bundled.js'

	if args.renderers:
		return 'browser_renderers.js'

	return 'browser_frontend.js'


def prepare_page(content, args):
	page, mime = content['/']
	page = page.replace(b'.value="original"', b'.value="web"')

	if args.bundled:
		setup = Path(__file__).with_name('browser_bundled_setup.js')
		content['/bundled_setup.js'] = (setup.read_bytes(), 'text/javascript')
		page = page.replace(b'<script src="host.js"></script>',
			b'<script src="/bundled_setup.js"></script><script src="host.js"></script>')

	content['/'] = (page, mime)


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--assets', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--executable')
	scenarios = parser.add_mutually_exclusive_group()
	scenarios.add_argument('--renderers', action='store_true', help='race the supplied package with every renderer')
	scenarios.add_argument('--bundled', action='store_true', help='exercise the configured bundled package')
	args = parser.parse_args()
	content = fixture(args.build, args.assets, scenario_script(args), bundled=args.bundled)
	prepare_page(content, args)
	report = run_browser(content, args.output, args.browser, args.executable, timeout=600)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} web frontend checks passed')


if __name__ == '__main__':
	main()
