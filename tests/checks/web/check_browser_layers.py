#!/usr/bin/env python3
"""Race with separate base/patch/add-on packages and reload after removing overlays."""

import argparse
import io
import json
from pathlib import Path
import re
import zipfile

from tests.checks.support.tbl import encode_table
from tests.checks.support.tbl import reference_decode
from tests.checks.support.browser import run_browser
from tests.checks.web.check_single_player import fixture


def addon(base):
	with zipfile.ZipFile(base) as archive:
		name = next(name for name in archive.namelist() if name.lower() == 'game/track1.trk')
		text = reference_decode(archive.read(name))

	text = re.sub(rb'(?im)^TrackName[ \t]+[^\r\n]*', b'TrackName LayerTest', text)
	text = re.sub(rb'(?im)^Division[ \t]+[^\r\n]*', b'Division 100001', text)
	output = io.BytesIO()

	with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
		archive.writestr('Game/layer-test.trk', encode_table(text))

	return output.getvalue()


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument('--build', type=Path, required=True)
	parser.add_argument('--base', type=Path, required=True)
	parser.add_argument('--patch', type=Path, required=True)
	parser.add_argument('--browser', choices=('chrome', 'firefox'), required=True)
	parser.add_argument('--output', type=Path, required=True)
	args = parser.parse_args()
	content = fixture(args.build, args.base, 'browser_layers.js')
	page, mime = content['/']
	page = page.replace(b'.value="original"', b'.value="web"')

	# Exercise ordinary unlocks, not a globally unlocked development deployment.
	page = re.sub(rb'(name="openmh-unlock-all"\s+content=")1', rb'\g<1>0', page)
	content['/'] = (page, mime)
	content['/patch.ass'] = (args.patch.read_bytes(), 'application/octet-stream')

	with zipfile.ZipFile(args.base) as base, zipfile.ZipFile(args.patch) as patch:
		base_tracks = {name.lower() for name in base.namelist() if name.lower().startswith('game/') and name.lower().endswith('.trk')}
		patch_tracks = {name.lower() for name in patch.namelist() if name.lower().startswith('game/') and name.lower().endswith('.trk')}

	content['/counts.json'] = (json.dumps({'base': len(base_tracks), 'combined': len(base_tracks | patch_tracks) + 1}).encode(), 'application/json')
	content['/addon.ass'] = (addon(args.base), 'application/octet-stream')
	report = run_browser(content, args.output, args.browser, timeout=300)

	if not report['passed']:
		raise RuntimeError(report['error'])

	print(f'{args.browser}: {len(report["checks"])} layered-game checks passed')


if __name__ == '__main__':
	main()
