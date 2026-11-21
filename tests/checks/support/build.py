"""Locate executables from a built website with an exported test runtime."""

from pathlib import Path


def build_executable(build, name):
	path = Path(build).resolve() / (name + '.js')

	if not path.is_file():
		raise ValueError(f'Missing {path}; build the website with a test runtime')

	return path
