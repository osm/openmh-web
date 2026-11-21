"""Render the site's small shared HTML fragments without a template dependency."""

import html
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'src'
FRAGMENTS = {'SITE_HEADER': 'site_header.html', 'PREPARE_GAME': 'prepare_game.html',
	'DOWNLOADS': 'downloads.html', 'PACKAGE_TOOLS': 'package_tools.html',
	'PACKAGE_LIBRARY': 'package_library.html', 'PACKAGE_UPLOAD': 'package_upload.html',
	'IMPORT_FORM': 'import_form.html', 'LIBRARY_NAVIGATION': 'library_navigation.html',
	'RESULT_HEADER': 'result_header.html'}

PACKAGE_SCRIPTS = ('package_store.js', 'package_input.js', 'package_downloads.js',
	'packages.js', 'content.js', 'import_progress.js', 'importer.js', 'tabs.js')


def script_tags(names):
	return '\n\t\t'.join(f'<script src="{html.escape(name, quote=True)}"></script>'
		for name in names)


def render(name, values):
	page = (SOURCE / name).read_text()
	page = page.replace('@PACKAGE_SCRIPTS@', script_tags(PACKAGE_SCRIPTS))

	for token, filename in FRAGMENTS.items():
		page = page.replace('@' + token + '@', (SOURCE / filename).read_text())

	for token, template in (('HOME', 'home.html'), ('PLAY', 'index.html'),
		('LIBRARY', 'game_files.html'), ('ABOUT', 'about.html')):
		current = ' aria-current="page"' if name == template else ''
		page = page.replace('@' + token + '_CURRENT@', current)

	for token, value in values.items():
		page = page.replace('@' + token + '@', value)

	return page
