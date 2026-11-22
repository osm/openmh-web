"""Verify the browser services and files required by the website."""

from contextlib import contextmanager
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile

if __package__:
	from .checksum import file_sha256
else:
	from checksum import file_sha256


LIBRARY_SCRIPTS = ('package-database.js', 'extract-job.js')
PLAYER_SCRIPTS = ('openmotor.js', 'database.js', 'storage.js', 'backup.js',
	'lifecycle.js', 'checkpoints.js', 'save-session.js', 'race-history.js',
	'multiplayer.js', 'preferences.js', 'player.js', 'session.js', *LIBRARY_SCRIPTS)
EXTRACTOR_FILES = ('openmotorex.js', 'openmotorex.wasm', 'extract-worker.js',
	'extract-workspace.js')


@contextmanager
def unpack_runtime(archive):
	"""Read the release's single directory of regular runtime files."""

	with tempfile.TemporaryDirectory(prefix='openmh-wasm-') as directory:
		runtime = Path(directory).resolve()
		root = None

		try:
			with tarfile.open(archive, 'r|gz') as package:
				for member in package:
					path = PurePosixPath(member.name)

					if path.is_absolute() or '..' in path.parts or not path.parts:
						raise ValueError(f'Invalid runtime archive path: {member.name}')

					if root is None:
						root = path.parts[0]

					if path.parts[0] != root:
						raise ValueError('Expected a single runtime directory in the archive')

					if member.isdir() and len(path.parts) == 1:
						continue

					name = path.name
					target = runtime / name

					if (len(path.parts) != 2 or not member.isfile() or
						'\\' in name or ':' in name or target.resolve().parent != runtime):
						raise ValueError(f'Invalid runtime archive member: {member.name}')

					with target.open('xb') as output:
						with package.extractfile(member) as source:
							shutil.copyfileobj(source, output)
		except (tarfile.TarError, EOFError) as error:
			raise ValueError(f'Invalid OpenMH Wasm archive: {error}') from error

		if not (runtime / 'runtime.json').is_file():
			raise ValueError('Missing runtime.json in OpenMH Wasm archive')

		yield runtime


def runtime_files(runtime, version, allow_testing=False, release=False):
	manifest = json.loads((runtime / 'runtime.json').read_text())

	if not isinstance(manifest, dict):
		raise ValueError('Invalid runtime manifest')

	if manifest.get('version') != version:
		raise ValueError(f'Runtime version must be {version!r}, got {manifest.get("version")!r}')

	if manifest.get('format') != 1 or not all(isinstance(manifest.get(key), bool)
		for key in ('testing', 'extractor')):
		raise ValueError('Unsupported runtime package format')

	if manifest.get('testing') and not allow_testing:
		raise ValueError('Test runtime requires --allow-test-runtime; do not deploy this build')

	files = manifest.get('files')
	scripts = manifest.get('scripts')

	if not isinstance(files, dict) or not isinstance(scripts, list) or not all(
		isinstance(name, str) and name.endswith('.js') for name in scripts):
		raise ValueError('Invalid runtime file or script list')

	missing = set(PLAYER_SCRIPTS).difference(scripts)

	if missing or len(set(scripts)) != len(scripts):
		raise ValueError(f'Incomplete or duplicate player scripts: {sorted(missing)}')

	required = set(scripts) | {'openmotor.wasm', 'package-check.js'}

	if release:
		required.add('licenses.txt')

	if manifest['extractor']:
		required.update(EXTRACTOR_FILES)

	missing = required.difference(files)

	if missing:
		raise ValueError(f'Missing required runtime files: {sorted(missing)}')

	for name, digest in files.items():
		if Path(name).name != name or name in ('.', '..') or '\\' in name:
			raise ValueError(f'Invalid runtime filename: {name}')

		path = runtime / name

		if path.is_symlink() or not path.is_file() or not path.stat().st_size:
			raise ValueError(f'Missing runtime file: {name}')

		if file_sha256(path).hex() != digest:
			raise ValueError(f'Runtime checksum mismatch: {name}')

	return manifest
