#!/usr/bin/env python3
"""Package a built website with content-versioned code and stable game assets."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

if __package__:
	from .checksum import file_sha256
	from .version import validate_version
	from .runtime import runtime_files
else:
	from checksum import file_sha256
	from version import validate_version
	from runtime import runtime_files

ROOT = Path(__file__).resolve().parents[1]


def release_files(site):
	marker = json.loads((site / '.openmh-web-build.json').read_text())
	files = {}

	for name in marker['files']:
		path = Path(name)

		if path.is_absolute() or '..' in path.parts or (site / path).is_symlink():
			raise ValueError(f'Invalid build filename: {name}')

		source = site / path

		if not source.is_file() or not source.resolve().is_relative_to(site.resolve()):
			raise ValueError(f'Missing build file: {name}')

		files[name] = source

	version = json.loads(files['version.json'].read_text())['runtimeVersion']
	manifest = runtime_files(site, version, release=True)
	runtime_names = {'runtime.json', *manifest['files']}

	if runtime_names.difference(files):
		raise ValueError('Build file list omits required runtime files')

	return files, runtime_names


def archive_name(site):
	# Use the built site's version even if the checkout has since changed.
	metadata = json.loads((site / 'version.json').read_text())
	version = validate_version(metadata['version'])

	return f'openmh_web-{version}.tar.gz'


def code_paths(files, runtime_names):
	code = sorted(name for name, source in files.items()
		if name in runtime_names or source.suffix in ('.js', '.wasm'))
	digest = hashlib.sha256()

	for name in code:
		digest.update(name.encode() + b'\0')
		digest.update(file_sha256(files[name]))

	prefix = 'code/' + digest.hexdigest()[:20] + '/'

	paths = {name: prefix + name for name in code}

	for name, source in files.items():
		if source.suffix == '.css' and name not in runtime_names:
			version = file_sha256(source).hex()[:20]
			paths[name] = f'code/{version}/{name}'

	return paths


def version_page(page, paths):
	page = re.sub(r'(<script\b[^>]*\bsrc=")([^"]+)(")',
		lambda match: match[1] + paths.get(match[2], match[2]) + match[3], page)

	page = re.sub(r'(<link\b[^>]*\bhref=")([^"]+)(")',
		lambda match: match[1] + paths.get(match[2], match[2]) + match[3], page)

	# Workers resolve their imports and Wasm relative to their own versioned URL.
	if 'extract-worker.js' in paths:
		page = page.replace('content="extract-worker.js"',
			'content="' + paths['extract-worker.js'] + '"')

	return page


def package(site, output):
	files, runtime_names = release_files(site)
	paths = code_paths(files, runtime_names)
	output.parent.mkdir(parents=True, exist_ok=True)

	# Do not publish a partial archive if writing fails.
	temporary = output.with_name(output.name + '.tmp')

	try:
		with tarfile.open(temporary, 'w:gz') as archive:
			for name, source in sorted(files.items()):
				target = paths.get(name, name)
				info = tarfile.TarInfo(target)
				info.mode = 0o644
				info.mtime = int(source.stat().st_mtime)

				if source.suffix == '.html' and name not in runtime_names:
					data = version_page(source.read_text(), paths).encode()
					info.size = len(data)
					archive.addfile(info, io.BytesIO(data))
				else:
					info.size = source.stat().st_size

					with source.open('rb') as stream:
						archive.addfile(info, stream)

		temporary.replace(output)
	finally:
		temporary.unlink(missing_ok=True)

	digest = file_sha256(output).hex()
	output.with_name(output.name + '.sha256').write_text(f'{digest}  {output.name}\n')

	return paths


def main():
	parser = argparse.ArgumentParser(prog='scripts/release', description=__doc__)
	parser.add_argument('--site', type=Path, default=ROOT / 'build/site',
		help='built website (default: build/site)')
	destination = parser.add_mutually_exclusive_group()
	destination.add_argument('--output', type=Path,
		help='override the deployment archive filename')
	destination.add_argument('--output-dir', type=Path, default=ROOT / 'build/packages',
		help='directory for openmh_web-VERSION.tar.gz (default: build/packages)')
	args = parser.parse_args()

	try:
		output = args.output or args.output_dir / archive_name(args.site)
		package(args.site, output)
	except (ValueError, OSError, KeyError) as error:
		parser.exit(1, f'Release failed: {error}\n')

	print(f'Release: {output}')


if __name__ == '__main__':
	main()
