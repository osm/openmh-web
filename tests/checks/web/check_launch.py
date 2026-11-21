#!/usr/bin/env python3
"""Check launch pages and protected/user packages with synthetic assets.

Uses exported public runtime services and a public player API test double.
No game files, engine source checkout, or live multiplayer server is needed.
"""

import argparse
import mimetypes
from pathlib import Path

from tools.build import build
from tools.runtime import unpack_runtime
from tests.checks.support.browser import run_browser


def resources(runtime, site):
	demo = site.parent / 'fixture-demo.ass'
	demo.write_bytes(b'BUILT-IN DEMO')
	build(runtime, site, demo=demo)
	result = {}

	for path in site.rglob('*'):
		if path.is_file():
			name = '/' + path.relative_to(site).as_posix()
			mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'

			if name.endswith('.html'):
				name = name[:-10]

			result[name] = (path.read_bytes(), mime)

	for name in ('/', '/play/', '/game-files/'):
		page, mime = result[name]
		page = page.replace(b'<script src="startup.js"></script>',
			b'<script src="test_player.js"></script><script src="launch_player.js"></script>'
			b'<script src="startup.js"></script>')
		page = page.replace(b'</body>', b'<script src="launch.js"></script></body>')
		result[name] = (page, mime)

	page, mime = result['/game-files/']
	result['/without-demo/'] = (page.replace(b'content="bundled/demo.ass"', b'content=""'), mime)
	result['/without-extractor/'] = (page.replace(b'name="openmh-extractor"',
		b'name="fixture-without-extractor"'), mime)

	for name in ('test_player.js', 'launch_player.js', 'launch.js'):
		result['/' + name] = (Path(__file__).with_name(name).read_bytes(), 'text/javascript')

	return result


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--openmh-wasm', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	args = parser.parse_args()
	args.output.mkdir(parents=True, exist_ok=False)

	with unpack_runtime(args.openmh_wasm) as runtime:
		pages = resources(runtime, args.output / 'site')

	report = run_browser(pages,
		args.output / 'browser', args.browser, timeout=120)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} launch checks passed')


if __name__ == '__main__':
	main()
