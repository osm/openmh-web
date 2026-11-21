"""Discover checks without importing them; execute only the selected module."""

from pathlib import Path
import runpy
import sys


def discover(directory, package):
	checks = {}

	for path in sorted(directory.glob('*/check_*.py')):
		name = path.stem.removeprefix('check_')

		if name in checks:
			raise ValueError(f'duplicate check name: {name}')

		checks[name] = (f'{package}.{path.parent.name}.{path.stem}', path.parent.name)

	return checks


def main(directory, package, command, arguments=None):
	arguments = list(sys.argv[1:] if arguments is None else arguments)
	checks = discover(Path(directory), package)

	if not arguments or arguments[0] in ('--help', '-h'):
		print(f'Usage: {command} --list\n'
			f'       {command} CHECK [arguments]\n\n'
			'Use CHECK --help for its dependencies and options.')

		return 0

	name = arguments[0]

	if name == '--list':
		for name, (_, group) in sorted(checks.items()):
			print(f'{name:40} {group}')

		return 0

	name = name.removeprefix('check_').removesuffix('.py')

	if name not in checks:
		print(f'Unknown check: {name}. Use {command} --list.', file=sys.stderr)

		return 2

	module, _ = checks[name]
	sys.argv = [module, *arguments[1:]]
	runpy.run_module(module, run_name='__main__')

	return 0
