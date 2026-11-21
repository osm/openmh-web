#!/usr/bin/env python3
"""Finish a real browser race, accept results and reload its IndexedDB saves.

Requires mh-browser-single-player-check and a patched retail .ass package. The
test-only AI driver races through the normal application. Browser keyboard
events operate menus/loading/results. Uses private saves and muted audio;
audio qualification is separate. Allow five minutes for a software WebGL GPU.
The time attack/recording flow allows twelve minutes for its three races.
The opening League season allows thirty minutes for its original lap counts.
"""

import argparse
import re
from pathlib import Path

from tests.checks.support.browser import run_browser
from tests.checks.support.build import build_executable


SCENARIOS = {
	"race": ("single_player.js", "single-player flow", 300),
	"checkpoints": ("browser_checkpoints.js", "menu checkpoint", 300),
	"recordings": ("browser_recordings.js", "time attack and recording", 720),
	"league": ("browser_league.js", "League season", 1800),
	"seasons": ("browser_seasons.js", "completed League season", 600),
}


def arguments():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--build", type=Path, required=True)
	parser.add_argument("--assets", type=Path, required=True)
	parser.add_argument("--browser", choices=("chrome", "firefox"), required=True)
	parser.add_argument("--executable")
	parser.add_argument("--output", type=Path, required=True)
	parser.set_defaults(scenario="race")
	scenarios = parser.add_mutually_exclusive_group()
	scenarios.add_argument("--checkpoints", dest="scenario", action="store_const", const="checkpoints",
		help="exercise menu autosaves, failure retry and reload instead of racing")
	scenarios.add_argument("--recordings", dest="scenario", action="store_const", const="recordings",
		help="complete time attack, then race and watch its saved recording")
	scenarios.add_argument("--league", dest="scenario", action="store_const", const="league",
		help="finish the first League season, reload standings and verify promotion")
	scenarios.add_argument("--seasons", dest="scenario", action="store_const", const="seasons",
		help="load completed-season fixtures and verify every League outcome")

	return parser.parse_args()


def fixture(build, assets, scenario_script, bundled=False):
	target = build_executable(build, "mh-browser-single-player-check")
	resources = {}

	for source in build.glob('*.js'):
		resources['/' + source.name] = (source.read_bytes(), 'text/javascript')

	resources['/style.css'] = ((build / 'style.css').read_bytes(), 'text/css')
	resources['/index.html'] = ((build / 'play/index.html').read_bytes(), 'text/html')
	page = resources["/index.html"][0].decode().replace(
		"</body>", '<script>document.getElementById("frontend").value="original";</script>'
		'<script src="/browser_flow.js"></script>'
		'<script src="/single_player.js"></script></body>')
	match = re.search(r'(<meta\s+name="openmh-assets"\s+content=")([^"]*)(")', page)

	if bundled:
		if not match or not match[2]:
			raise RuntimeError('Build the website with --assets before this check')

		for url in match[2].split(';'):
			resources['/' + url] = ((build / url).read_bytes(), 'application/octet-stream')
	elif match:
		page = page[:match.start(2)] + page[match.end(2):]

	resources["/"] = (page.encode(), "text/html")
	resources["/openmotor.js"] = (target.read_bytes(), "text/javascript")
	wasm = target.with_suffix(".wasm")
	resources["/" + wasm.name] = (wasm.read_bytes(), "application/wasm")
	resources["/game.ass"] = (assets.read_bytes(), "application/octet-stream")
	shared = Path(__file__).with_name("browser_flow.js")
	resources["/browser_flow.js"] = (shared.read_bytes(), "text/javascript")
	script = Path(__file__).with_name(scenario_script)
	resources["/single_player.js"] = (script.read_bytes(), "text/javascript")
	page, mime = resources['/']
	page = page.replace(b'<script src="startup.js"></script>',
		b'<script src="test_runtime.js"></script><script src="host.js"></script>')
	resources['/'] = (page, mime)
	resources['/test_runtime.js'] = (Path(__file__).with_name('test_runtime.js').read_bytes(), 'text/javascript')

	return resources


def main():
	args = arguments()
	script, scenario, timeout = SCENARIOS[args.scenario]
	report = run_browser(fixture(args.build, args.assets, script), args.output,
		args.browser, args.executable, timeout=timeout)

	if not report["passed"]:
		raise RuntimeError(report["error"])

	print(f'{args.browser}: {len(report["checks"])} {scenario} checks passed')


if __name__ == "__main__":
	main()
