#!/usr/bin/env python3
"""Check browser gestures, asset input and fullscreen on an isolated X11 display.

Run with xvfb-run -a -s '-screen 0 1280x1024x24'. Requires xdotool, wmaker, scrot,
an audio server, mh-browser-single-player-check and a patched retail package.
Uses private saves, real X11 input and default browser autoplay policy.
Never run on your desktop.
"""

import argparse
import re
from pathlib import Path

from tests.checks.support.browser import run_browser
from tests.checks.support.browser_input import BrowserInput, browser_window_manager
from tests.checks.support.build import build_executable


def resources(build, assets):
	target = build_executable(build, 'mh-browser-single-player-check')
	result = {
		'/openmotor.js': (target.read_bytes(), 'text/javascript'),
		'/' + target.with_suffix('.wasm').name:
		(target.with_suffix('.wasm').read_bytes(), 'application/wasm')}

	for source in build.glob('*.js'):
		result['/' + source.name] = (source.read_bytes(), 'text/javascript')

	result['/openmotor.js'] = (target.read_bytes(), 'text/javascript')
	result['/style.css'] = ((build / 'style.css').read_bytes(), 'text/css')
	page = (build / 'play/index.html').read_text().replace(
		'<script src="openmotor.js">', '<script src="audio_probe.js"></script>'
		'<script src="openmotor.js">').replace(
		'</body>', '<script>document.getElementById("frontend").value="original";</script><script src="browser_flow.js"></script>'
		'<script src="browser_interaction.js"></script></body>')
	page = re.sub(r'(<meta\s+name="openmh-assets"\s+content=")[^"]*', r'\1', page)
	result['/'] = (page.encode(), 'text/html')
	result['/game.ass'] = (assets.read_bytes(), 'application/octet-stream')

	for name in ('browser_flow.js', 'browser_interaction.js', 'audio_probe.js'):
		result['/' + name] = (Path(__file__).with_name(name).read_bytes(), 'text/javascript')

	page, mime = result['/']
	page = page.replace(b'<script src="startup.js"></script>',
		b'<script src="test_runtime.js"></script><script src="host.js"></script>')
	result['/'] = (page, mime)
	result['/test_runtime.js'] = (Path(__file__).with_name('test_runtime.js').read_bytes(), 'text/javascript')

	return result


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--assets', type=Path, required=True)
	parser.add_argument('--output', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--executable')
	args = parser.parse_args()

	with browser_window_manager():
		report = run_browser(resources(args.build, args.assets), args.output, args.browser,
			args.executable, timeout=180, headless=False,
			input_handler=BrowserInput(args.assets, args.output))

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} browser interaction checks passed')


if __name__ == '__main__':
	main()
