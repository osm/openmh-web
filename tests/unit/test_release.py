"""Check deployable archives without using game assets."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

from tests.unit.runtime_fixture import write_runtime
from tools.release import ROOT, archive_name, package


class ReleaseTests(unittest.TestCase):
	def setUp(self):
		temporary = tempfile.TemporaryDirectory()
		self.addCleanup(temporary.cleanup)
		self.root = Path(temporary.name)
		self.site = self.root / 'site'
		self.site.mkdir()
		self.files = {
			'version.json': '{"version": "2.3.4-rc.2", "runtimeVersion": "1.0.0"}',
			'startup.js': '// start', 'host.js': '// host',
			'openmotor.js': '// runtime', 'openmotor.wasm': 'wasm',
			'extract-worker.js': '// worker',
			'style.css': 'body { color: white; }',
			'extract-workspace.js': '// workspace',
			'bundled/demo.ass': 'synthetic demo',
			'index.html': '<a href="play/">Play</a>',
			'play/index.html': '<base href="../"><script src="startup.js"></script>'
			'<script src="openmotor.js"></script>'
			'<link rel="stylesheet" href="style.css">'
			'<link rel="icon" href="favicon.ico">'
			'<meta name="openmh-extractor" content="extract-worker.js">'
			'<meta name="openmh-assets" content="bundled/demo.ass">',
		}

		for name, content in self.files.items():
			target = self.site / name
			target.parent.mkdir(parents=True, exist_ok=True)
			target.write_text(content)

		manifest = write_runtime(self.site, '1.0.0', extractor=True)
		self.files.update({name: (self.site / name).read_text()
			for name in ('runtime.json', *manifest['files'])})
		(self.site / '.openmh-web-build.json').write_text(json.dumps({'files': list(self.files)}))
		self.output = self.root / 'website.tar.gz'

	def test_cli_names_archive_from_built_website_version(self):
		directory = self.root / 'packages'
		subprocess.run([sys.executable, str(ROOT / 'tools/release.py'),
			'--site', str(self.site), '--output-dir', str(directory)],
			check=True, capture_output=True, text=True)
		archive = directory / 'openmh_web-2.3.4-rc.2.tar.gz'
		self.assertTrue(archive.is_file())
		self.assertTrue(archive.with_name(archive.name + '.sha256').is_file())

		with tarfile.open(archive) as bundle:
			self.assertEqual(json.load(bundle.extractfile('version.json')),
				{'version': '2.3.4-rc.2', 'runtimeVersion': '1.0.0'})

	def test_invalid_versions_cannot_become_archive_names(self):
		for version in ('../escape', '', '1.2', '1.2.3/escape', '1.2.3\nextra', None):
			with self.subTest(version=version):
				(self.site / 'version.json').write_text(json.dumps({'version': version}))

				with self.assertRaisesRegex(ValueError, 'Invalid website version'):
					archive_name(self.site)

	def test_archive_versions_code_and_preserves_asset_urls(self):
		(self.site / 'private.txt').write_text('not part of the build')
		paths = package(self.site, self.output)

		with tarfile.open(self.output) as archive:
			names = archive.getnames()
			self.assertEqual(set(names), {paths.get(name, name) for name in self.files})
			self.assertTrue(all(item.mode == 0o644 and item.isfile() for item in archive))
			page = archive.extractfile('play/index.html').read().decode()

			for name in ('startup.js', 'openmotor.js', 'extract-worker.js', 'style.css'):
				self.assertIn('"' + paths[name] + '"', page)

			self.assertIn('content="bundled/demo.ass"', page)
			self.assertIn('href="favicon.ico"', page)
			self.assertEqual(archive.extractfile('bundled/demo.ass').read(), b'synthetic demo')

		with self.output.open('rb') as stream:
			checksum = hashlib.file_digest(stream, 'sha256').hexdigest()

		self.assertEqual(self.output.with_name(self.output.name + '.sha256').read_text(),
			f'{checksum}  {self.output.name}\n')
		self.assertEqual(package(self.site, self.output), paths)

		(self.site / 'host.js').write_text('// updated host')
		updated = package(self.site, self.output)
		self.assertNotEqual(updated['startup.js'], paths['startup.js'])
		self.assertEqual(updated['style.css'], paths['style.css'])
		(self.site / 'style.css').write_text('body { color: orange; }')
		restyled = package(self.site, self.output)
		self.assertNotEqual(restyled.pop('style.css'), updated.pop('style.css'))
		self.assertEqual(restyled, updated)

	def test_archived_runtime_matches_its_manifest(self):
		paths = package(self.site, self.output)
		manifest_path = Path(paths['runtime.json'])

		with tarfile.open(self.output) as archive:
			manifest = json.load(archive.extractfile(manifest_path.as_posix()))

			for name, expected in manifest['files'].items():
				with self.subTest(name=name):
					path = (manifest_path.parent / name).as_posix()

					with archive.extractfile(path) as stream:
						digest = hashlib.file_digest(stream, 'sha256')

					self.assertEqual(digest.hexdigest(), expected)

	def test_development_runtime_requires_combined_notices_for_release(self):
		manifest = json.loads((self.site / 'runtime.json').read_text())
		del manifest['files']['licenses.txt']
		(self.site / 'runtime.json').write_text(json.dumps(manifest))

		with self.assertRaisesRegex(ValueError, 'licenses.txt'):
			package(self.site, self.output)

		self.assertFalse(self.output.exists())

	def test_missing_worker_in_archive_file_list(self):
		del self.files['extract-worker.js']
		(self.site / '.openmh-web-build.json').write_text(json.dumps({'files': list(self.files)}))

		with self.assertRaisesRegex(ValueError, 'omits required runtime'):
			package(self.site, self.output)

		self.assertFalse(self.output.exists())

	def test_test_runtime_cannot_be_released(self):
		manifest = json.loads((self.site / 'runtime.json').read_text())
		manifest['testing'] = True
		(self.site / 'runtime.json').write_text(json.dumps(manifest))

		with self.assertRaisesRegex(ValueError, 'allow-test-runtime'):
			package(self.site, self.output)

		self.assertFalse(self.output.exists())

	def test_invalid_build_path_cannot_be_released(self):
		(self.site / '.openmh-web-build.json').write_text(json.dumps({'files': ['../private']}))

		with self.assertRaisesRegex(ValueError, 'Invalid build filename'):
			package(self.site, self.output)

		self.assertFalse(self.output.exists())
