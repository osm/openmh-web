"""Shared clang-format invocation and convergence checking."""

import subprocess


FORMAT_PASSES = 4


def format_clang(source, path, executable, transform=None):
	for _ in range(FORMAT_PASSES):
		result = subprocess.check_output(
			[executable, "--style=file",
				"--assume-filename=" + str(path.resolve())],
			input=source, text=True,
		)

		if transform is not None:
			result = transform(result)

		if result == source:
			return result

		source = result

	raise ValueError("formatting did not stabilize")
