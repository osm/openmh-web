#!/usr/bin/env python3
"""Build and package the website through its shared command entry points."""

import json
import os
from pathlib import Path
import shlex
import subprocess


def main():
	version = json.loads(Path('runtime.lock.json').read_text())['version']
	archive = Path('/runtime') / f'openmh-{version}-wasm.tar.gz'

	if not archive.is_file():
		raise SystemExit(f'Supply --build-context runtime=DIR containing {archive.name}')

	options = shlex.split(os.environ.get('SITE_ARGS', ''))
	subprocess.run(['bash', 'scripts/build', *options,
		'--openmh-wasm', str(archive), '--output', '/out/site'], check=True)
	subprocess.run(['bash', 'scripts/release', '--site', '/out/site',
		'--output-dir', '/out/packages'], check=True)


if __name__ == '__main__':
	main()
