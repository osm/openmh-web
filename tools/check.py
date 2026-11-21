"""Run website formatting and unit checks, or an optional integration check."""

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
CHECKS = ('format', 'unit')


def run(label, command):
	print(f'\n{label}', flush=True)
	subprocess.run(command, cwd=ROOT, check=True)


def main(arguments=None):
	arguments = list(sys.argv[1:] if arguments is None else arguments)
	python = [sys.executable, '-B']

	if arguments and arguments[0] == 'integration':
		# Integration paths remain relative to the caller's directory.
		return subprocess.call(python + [str(ROOT / 'tests/check.py'),
			*arguments[1:]])

	parser = argparse.ArgumentParser(prog='scripts/check', description=__doc__,
		epilog='Optional browser checks: scripts/check integration --list')
	selection = parser.add_argument_group('check selection (default: all)')
	selection.add_argument('--format', dest='checks', action='append_const',
		const='format', help='verify source formatting without changes')
	selection.add_argument('--unit', dest='checks', action='append_const',
		const='unit', help='run Python unit tests')
	args = parser.parse_args(arguments)
	checks = args.checks or CHECKS

	try:
		if 'format' in checks:
			run('Checking formatting', python + [str(ROOT / 'tools/format.py'), '--check'])

		if 'unit' in checks:
			run('Running Python unit tests', python +
				['-m', 'unittest', 'discover', '-s', 'tests/unit'])
	except (OSError, subprocess.CalledProcessError) as error:
		parser.exit(1, f'Checks failed: {error}\n')

	print('\nSelected checks passed.')

	return 0


if __name__ == '__main__':
	raise SystemExit(main())
