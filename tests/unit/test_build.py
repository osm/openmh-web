"""Check runtime compatibility and safe, repeatable website assembly."""

import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from tests.unit.runtime_fixture import write_runtime
from tools import build


class BuildTests(unittest.TestCase):
	def setUp(self):
		self.temporary = tempfile.TemporaryDirectory()
		self.addCleanup(self.temporary.cleanup)
		self.root = Path(self.temporary.name)
		self.runtime = self.root / 'runtime'
		self.runtime.mkdir()
		self.output = self.root / 'site'
		self.lock = json.loads((build.ROOT / 'runtime.lock.json').read_text())
		self.manifest = write_runtime(self.runtime, self.lock['version'])

	def write_manifest(self):
		(self.runtime / 'runtime.json').write_text(json.dumps(self.manifest))

	def assemble(self, **kwargs):
		with patch('builtins.print'):
			build.build(self.runtime, self.output, **kwargs)

	def test_build_from_wasm_release(self):
		archive = self.root / 'openmh-1.0.0-wasm.tar.gz'

		with tarfile.open(archive, 'w:gz') as package:
			package.add(self.runtime, arcname='openmh-1.0.0-wasm')

		subprocess.run([str(build.ROOT / 'scripts/build'), '--openmh-wasm', str(archive),
			'--output', str(self.output)], check=True, capture_output=True)
		self.assertEqual((self.output / 'openmotor.wasm').read_bytes(), b'wasm')

	def test_invalid_archive_leaves_output_untouched(self):
		archive = self.root / 'invalid.tar.gz'

		with tarfile.open(archive, 'w:gz') as package:
			package.add(self.runtime, arcname='runtime')
			package.addfile(tarfile.TarInfo('runtime/../outside'))

		result = subprocess.run([str(build.ROOT / 'scripts/build'), '--openmh-wasm', str(archive),
			'--output', str(self.output)], capture_output=True, text=True)
		self.assertNotEqual(result.returncode, 0)
		self.assertIn('Invalid runtime archive path', result.stderr)
		self.assertFalse(self.output.exists())

	def test_build_and_remove_bundled_assets(self):
		base, overlay = self.root / 'base.ass', self.root / 'patch.ass'
		base.write_bytes(b'base')
		overlay.write_bytes(b'patch')
		self.assemble(assets=[base, overlay])
		self.assertEqual((self.output / 'LICENSE.md').read_bytes(),
			(build.ROOT / 'LICENSE.md').read_bytes())
		self.assertEqual(json.loads((self.output / 'version.json').read_text()),
			{'version': (build.ROOT / 'VERSION').read_text().strip(),
				'runtimeVersion': self.lock['version']})
		page = (self.output / 'play/index.html').read_text()
		self.assertIn('bundled/game.ass;bundled/package1.ass', page)
		self.assertIn('<script src="openmotor.js"></script>', page)
		self.assertIn('name="openmh-unlock-all" content="1"', page)
		self.assertNotIn('@RUNTIME_SCRIPTS@', page)
		self.assertEqual((self.output / 'bundled/game.ass').read_bytes(), b'base')
		stamp = (self.output / 'bundled/game.ass').stat().st_mtime_ns
		self.assemble(assets=[base, overlay])
		self.assertEqual(stamp, (self.output / 'bundled/game.ass').stat().st_mtime_ns)
		base.write_bytes(b'edit')
		self.assemble(assets=[base, overlay])
		self.assertEqual((self.output / 'bundled/game.ass').read_bytes(), b'edit')
		self.assemble(unlock_all=False)
		self.assertIn('name="openmh-unlock-all" content="0"',
			(self.output / 'play/index.html').read_text())
		self.assertFalse((self.output / 'bundled/game.ass').exists())
		self.assertFalse((self.output / 'bundled/package1.ass').exists())
		self.assertNotIn('bundled/game.ass', (self.output / 'play/index.html').read_text())

	def test_included_screenshot(self):
		self.assemble()
		default = (build.ROOT / 'assets/preview.png').read_bytes()
		self.assertEqual((self.output / 'preview.png').read_bytes(), default)
		self.assertIn('src="preview.png"', (self.output / 'index.html').read_text())

	def test_launch_pages_and_separate_demo(self):
		demo = self.root / 'demo.ass'
		demo.write_bytes(b'demo fixture')
		self.assemble(demo=demo)
		home = (self.output / 'index.html').read_text()
		play = (self.output / 'play/index.html').read_text()
		guide = (self.output / 'game-files/index.html').read_text()
		self.assertFalse((self.output / 'prepare/index.html').exists())
		self.assertFalse((self.output / 'downloads/index.html').exists())
		self.assertIn('data-route="library"', guide)
		self.assertIn('data-route="prepare"', guide)
		self.assertIn('data-route="downloads"', guide)
		self.assertIn('id="prepare-game"', guide)
		about = (self.output / 'about/index.html').read_text()
		self.assertIn('Digital Illusions', about)
		self.assertIn('<base href="../"', about)
		self.assertNotIn('openmotor.js', about)
		self.assertIn('Play ↗', home)
		self.assertNotIn('play/?content=builtin', home)
		self.assertEqual((self.output / 'favicon.ico').read_bytes(),
			(build.ROOT / 'assets/favicon.ico').read_bytes())
		self.assertNotIn('Use your own game files', home)
		self.assertNotIn('openmotor.js', home)
		self.assertNotIn('openmotor.wasm', home)
		self.assertNotIn('openmotor.js', guide)
		self.assertIn('Built-in demo', play)
		self.assertIn('bundled/demo.ass', play)
		self.assertEqual((self.output / 'bundled/demo.ass').read_bytes(), b'demo fixture')
		self.assertEqual((self.output / 'openmotor.wasm').read_bytes(), b'wasm')
		stamp = (self.output / 'bundled/demo.ass').stat().st_mtime_ns
		self.assemble(demo=demo)
		self.assertEqual(stamp, (self.output / 'bundled/demo.ass').stat().st_mtime_ns)

		for page in (home, play, guide, about):
			self.assertIn('rel="icon" href="favicon.ico"', page)
			self.assertIn('rel="stylesheet" href="style.css"', page)
			self.assertNotIn('<style', page)
			self.assertNotRegex(page, r'@[A-Z_]+@')

		with self.assertRaisesRegex(ValueError, 'not both'):
			self.assemble(demo=demo, assets=[demo])

	def test_each_page_marks_its_own_header_link(self):
		self.assemble()

		for path, link in [('index.html', 'aria-label="OpenMH home"'), ('play/index.html', 'href="play/"'),
			('game-files/index.html', 'href="game-files/"'), ('about/index.html', 'href="about/"')]:
			with self.subTest(path=path):
				page = (self.output / path).read_text()
				self.assertIn(link + ' aria-current="page"', page)
				self.assertEqual(page.count('aria-current="page"'), 1)

	def test_incomplete_runtime_rejected_before_output(self):
		for missing in ('openmotor.js', 'package-check.js', 'storage.js', 'openmotor.wasm', 'extract-worker.js'):
			with self.subTest(missing=missing):
				self.manifest = write_runtime(self.runtime, self.lock['version'], extractor=True)
				del self.manifest['files'][missing]

				if missing in self.manifest['scripts']:
					self.manifest['scripts'].remove(missing)

				self.write_manifest()

				with self.assertRaisesRegex(ValueError, 'scripts|required runtime'):
					self.assemble()

				self.assertFalse(self.output.exists())

	def test_original_downloads_are_curated_and_copied(self):
		from tools.downloads import CATALOG

		resources = self.root / 'downloads'

		for folder, entries in CATALOG.values():
			(resources / folder).mkdir(parents=True)

			for _, name in entries:
				(resources / folder / name).write_bytes(('MZ ' + name).encode())

		(resources / 'patches/motorp31_creative.zip').write_bytes(b'excluded')
		self.assemble(downloads=resources)
		page = (self.output / 'game-files/index.html').read_text()
		self.assertIn('<title>OpenMH - Game library</title>', page)
		self.assertIn('<base href="../"', page)
		self.assertNotIn('openmotor.js', page)
		self.assertEqual(page.count('href="downloads/files/motor'), 13)
		files = self.output / 'downloads/files'
		self.assertEqual(len(list(files.iterdir())), 14)
		self.assertEqual(page.count('<summary>SHA-256</summary>'), 13)
		checksums = (files / 'SHA256SUMS').read_text().splitlines()
		self.assertEqual(len(checksums), 13)

		for line in checksums:
			digest, filename = line.split('  ', 1)
			self.assertEqual(digest, hashlib.sha256((files / filename).read_bytes()).hexdigest())
			self.assertIn(f'<code>{digest}</code>', page)

		self.assertNotIn('href="downloads/files/SHA256SUMS"', page)
		self.assertEqual((files / 'motorp31.exe').read_bytes(), b'MZ motorp31.exe')
		self.assertNotIn('creative', page.lower())
		self.assertFalse(list(files.glob('*.zip')))
		self.assertIn('data-route="downloads"', (self.output / 'game-files/index.html').read_text())
		stamp = (files / 'motorp31.exe').stat().st_mtime_ns
		self.assemble(downloads=resources)
		self.assertEqual(stamp, (files / 'motorp31.exe').stat().st_mtime_ns)
		(resources / 'patches/motorp31.exe').unlink()

		with self.assertRaisesRegex(ValueError, 'Missing download source'):
			self.assemble(downloads=resources)

		self.assertEqual(page, (self.output / 'game-files/index.html').read_text())
		self.assemble()
		self.assertFalse(list(files.iterdir()))
		self.assertNotIn('download="', (self.output / 'game-files/index.html').read_text())

	def test_incompatible_version_preserves_existing_build(self):
		self.assemble()
		original = (self.output / 'index.html').read_bytes()
		self.manifest['version'] = '999.0.0'
		self.write_manifest()

		with self.assertRaisesRegex(ValueError, 'version'):
			self.assemble()

		self.assertEqual(original, (self.output / 'index.html').read_bytes())

	def test_corrupt_runtime_rejected_before_output(self):
		(self.runtime / 'openmotor.wasm').write_bytes(b'wrong')

		with self.assertRaisesRegex(ValueError, 'checksum'):
			self.assemble()

		self.assertFalse(self.output.exists())

	def test_test_runtime_requires_explicit_opt_in(self):
		self.manifest['testing'] = True
		self.write_manifest()

		with self.assertRaisesRegex(ValueError, 'allow-test-runtime'):
			self.assemble()

		self.assemble(allow_testing=True)

	def test_unowned_output_is_not_modified(self):
		self.output.mkdir()
		marker = self.output / 'keep'
		marker.write_text('keep')

		with self.assertRaisesRegex(ValueError, 'Output must be empty'):
			self.assemble()

		self.assertEqual(marker.read_text(), 'keep')

	def test_runtime_paths_are_rejected(self):
		self.manifest['files']['../escape.js'] = 'unused'
		self.write_manifest()

		with self.assertRaisesRegex(ValueError, 'filename'):
			self.assemble()

	def test_multiplayer_config_is_escaped_and_preserved(self):
		from html.parser import HTMLParser

		class Metadata(HTMLParser):
			connection = None

			def handle_starttag(self, tag, attributes):
				values = dict(attributes)

				if tag == 'meta' and values.get('name') == 'openmh-multiplayer':
					self.connection = json.loads(values['content'])

		config = {'url': 'https://example.test/?x="<tag>"',
			'iceServers': [{'urls': ['turn:relay.test'], 'username': 'user',
				'credential': 'quoted"<&'}], 'relayOnly': True}
		self.assemble(multiplayer=config)
		parser = Metadata()
		parser.feed((self.output / 'play/index.html').read_text())
		self.assertEqual(parser.connection, config)
		self.assertNotIn('@MULTIPLAYER@', (self.output / 'play/index.html').read_text())

	def test_invalid_multiplayer_preserves_output(self):
		self.assemble()
		original = (self.output / 'index.html').read_bytes()

		for value in ([], {'relayOnly': 'yes'}, {'password': 'secret'},
			{'iceServers': [{'urls': []}]}, {'iceServers': ['turn:test']},
			{'iceServers': [{'urls': ['turn:test'] * 9}]}):
			with self.subTest(value=value), self.assertRaises(ValueError):
				self.assemble(multiplayer=value)

			self.assertEqual(original, (self.output / 'index.html').read_bytes())

	def test_ui_uses_public_runtime_api(self):
		for path in (build.ROOT / 'src').glob('*.js'):
			with self.subTest(path=path.name):
				self.assertNotRegex(path.read_text(),
					r'\.(?:engine|FS|HEAP\w*|ccall|callMain|_mh_\w*|lifecycle|checkpoints)\b|\bcreateOpenMH\b')


if __name__ == '__main__':
	unittest.main()
