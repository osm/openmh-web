#!/usr/bin/env python3
"""Build the website from a compatible, independently built OpenMH runtime."""

import argparse
import html
import json
from pathlib import Path
import shutil

if __package__:
	from .checksum import file_sha256
	from .pages import render, script_tags
	from .runtime import LIBRARY_SCRIPTS, runtime_files, unpack_runtime
	from .downloads import prepare as prepare_downloads
	from .version import validate_version
else:
	from checksum import file_sha256
	from pages import render, script_tags
	from runtime import LIBRARY_SCRIPTS, runtime_files, unpack_runtime
	from downloads import prepare as prepare_downloads
	from version import validate_version

ROOT = Path(__file__).resolve().parents[1]


def multiplayer_config(value):
	"""Validate the deployment's public connection defaults before modifying output."""

	if value is None:
		return {}

	if not isinstance(value, dict) or set(value) - {'url', 'iceServers', 'relayOnly'}:
		raise ValueError('Multiplayer config accepts url, iceServers and relayOnly')

	if 'url' in value and not isinstance(value['url'], str):
		raise ValueError('Multiplayer url must be a string')

	if 'relayOnly' in value and not isinstance(value['relayOnly'], bool):
		raise ValueError('Multiplayer relayOnly must be boolean')

	servers = value.get('iceServers', [])

	if not isinstance(servers, list):
		raise ValueError('Multiplayer iceServers must be an array')

	count = 0

	for server in servers:
		if not isinstance(server, dict) or set(server) - {'urls', 'username', 'credential'}:
			raise ValueError('Invalid multiplayer ICE server')

		urls = server.get('urls')
		urls = [urls] if isinstance(urls, str) else urls

		if not isinstance(urls, list) or not urls or not all(isinstance(url, str) and url for url in urls):
			raise ValueError('ICE server urls must contain nonempty strings')

		count += len(urls)

		for field in ('username', 'credential'):
			if field in server and not isinstance(server[field], str):
				raise ValueError(f'ICE server {field} must be a string')

	if count > 8:
		raise ValueError('At most eight ICE server URLs are supported')

	return value


def build(runtime, output, assets=(), unlock_all=True, allow_testing=False, multiplayer=None,
	demo=None, downloads=None):
	multiplayer = multiplayer_config(multiplayer)
	runtime, output = runtime.resolve(), output.resolve()
	manifest = runtime_files(runtime, json.loads((ROOT / 'runtime.lock.json').read_text())['version'], allow_testing)
	version = validate_version((ROOT / 'VERSION').read_text().strip())

	if demo and assets:
		raise ValueError('Choose --demo or --assets, not both')

	assets = [Path(demo).resolve()] if demo else [path.resolve() for path in assets]

	screenshot = ROOT / 'assets/preview.png'

	if not screenshot.is_file():
		raise ValueError('Missing landing-page image: assets/preview.png')

	for path in assets:
		if path.suffix.lower() != '.ass' or not path.is_file():
			raise ValueError(f'Expected an existing .ass package: {path}')

	download_sources, binaries, download_values = prepare_downloads(downloads)
	marker = output / '.openmh-web-build.json'

	if output.exists() and any(output.iterdir()) and not marker.is_file():
		raise ValueError('Output must be empty or an existing openmh-web build')

	if output == runtime or output in runtime.parents or runtime in output.parents:
		raise ValueError('Runtime and output directories must be separate')

	sources = {path.name: path for path in (ROOT / 'src').iterdir()
		if path.is_file() and path.suffix != '.html'}
	overlap = set(sources) & set(manifest['files'])

	if overlap:
		raise ValueError(f'UI/runtime filename collision: {sorted(overlap)}')

	sources.update({name: runtime / name for name in manifest['files']})
	sources['runtime.json'] = runtime / 'runtime.json'
	sources['LICENSE.md'] = ROOT / 'LICENSE.md'
	sources.update(download_sources)
	urls = []

	for index, path in enumerate(assets):
		name = 'bundled/demo.ass' if demo else (
			'bundled/game.ass' if index == 0 else f'bundled/package{index}.ass')
		sources[name] = path
		urls.append(name)

	preview = 'preview.png'
	sources[preview] = screenshot
	sources['favicon.ico'] = ROOT / 'assets/favicon.ico'

	values = {
		'RUNTIME_SCRIPTS': script_tags(manifest['scripts']),
		'RUNTIME_SERVICES': script_tags(LIBRARY_SCRIPTS),
		'EXTRACTOR_URL': 'extract-worker.js' if manifest['extractor'] else '',
		'ASSET_URL': html.escape(';'.join(urls), quote=True),
		'CONTENT_LABEL': 'Built-in demo' if demo else 'Included game',
		'MULTIPLAYER': html.escape(json.dumps(multiplayer), quote=True),
		'UNLOCK_ALL': '1' if unlock_all else '0',
		'BASE_URL': '../',
		'HERO_IMAGE': (f'<img class="hero-image" src="{preview}" width="1280" height="720" '
			'alt="Motorhead gameplay in the OpenMH browser player" />'),
	}
	values.update(download_values)
	documents = {'index.html': render('home.html', values),
		'play/index.html': render('index.html', values),
		'game-files/index.html': render('game_files.html', values),
		'about/index.html': render('about.html', values),
		'version.json': json.dumps({'version': version,
			'runtimeVersion': manifest['version']}, indent=2) + '\n'}
	generated = set(sources) | set(documents) | set(binaries)

	# Keep stable asset timestamps so browser caches can reuse large packages.
	output.mkdir(parents=True, exist_ok=True)

	if marker.exists():
		for name in json.loads(marker.read_text())['files']:
			relative = Path(name)

			if relative.is_absolute() or '..' in relative.parts:
				raise ValueError('Invalid previous build filename')

			if name not in generated:
				(output / name).unlink(missing_ok=True)

	for name, source in sources.items():
		destination = output / name
		destination.parent.mkdir(parents=True, exist_ok=True)

		if not destination.exists() or source.stat().st_size != destination.stat().st_size or \
			file_sha256(source) != file_sha256(destination):
			shutil.copy2(source, destination)

	for name, data in binaries.items():
		destination = output / name
		destination.parent.mkdir(parents=True, exist_ok=True)

		if not destination.exists() or destination.read_bytes() != data:
			destination.write_bytes(data)

	for name, page in documents.items():
		destination = output / name
		destination.parent.mkdir(parents=True, exist_ok=True)
		destination.write_text(page)

	marker.write_text(json.dumps({'files': sorted(generated)}, indent=2) + '\n')
	print(f'Website: {output} (OpenMH Web {version}, OpenMH {manifest["version"]})')


def main():
	parser = argparse.ArgumentParser(prog='scripts/build', description=__doc__)
	parser.add_argument('--openmh-wasm', type=Path, required=True, metavar='ARCHIVE',
		help='OpenMH Wasm release archive (.tar.gz)')
	parser.add_argument('--output', type=Path, default=ROOT / 'build' / 'site',
		help='website output directory (default: build/site)')
	parser.add_argument('--assets', type=Path, action='append', default=[], help='bundle an .ass file; repeat for overlays')
	parser.add_argument('--demo', type=Path, help='bundle the protected demo .ass beside the runtime')
	parser.add_argument('--downloads', type=Path, help='original downloads root containing demo/ and patches/')
	parser.add_argument('--multiplayer-config', type=Path, help='JSON default server and ICE configuration')
	parser.add_argument('--unlock-all', action=argparse.BooleanOptionalAction, default=True,
		help='unlock installed cars and tracks (default: enabled)')
	parser.add_argument('--allow-test-runtime', action='store_true')
	args = parser.parse_args()

	try:
		connection = json.loads(args.multiplayer_config.read_text()) if args.multiplayer_config else None

		with unpack_runtime(args.openmh_wasm) as runtime:
			build(runtime, args.output, args.assets, args.unlock_all, args.allow_test_runtime,
				connection, args.demo, args.downloads)
	except (ValueError, OSError, KeyError) as error:
		parser.exit(1, f'Build failed: {error}\n')


if __name__ == '__main__':
	main()
