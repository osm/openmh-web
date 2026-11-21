#!/usr/bin/env python3
"""Format project sources with their language-specific conventions.

Copyright 2026 Oscar Linderholm.
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from format_javascript import format_javascript
from format_python import format_python, python_files


FORMATTERS = {".js": format_javascript}


def main():
	parser = argparse.ArgumentParser(
		description="Format project JavaScript and Python in place.",
		formatter_class=argparse.RawDescriptionHelpFormatter,
		epilog="""Without file arguments, scans src/ and tests/ in this checkout.
JavaScript comes from src/ and tests/. Python also includes tools/,
docker/ and scripts/, excluding build output.
Explicit file paths are relative to your current directory.

Examples (from the repository root):
  ./tools/format.py                 Format all project sources
  ./tools/format.py --check         Check formatting without changing files
  ./tools/format.py src/host.js      Format one file

Requires Python 3 and clang-format 18 or newer.
--check exits with status 1 if any file needs formatting.
""",
	)
	parser.add_argument("--check", action="store_true",
		help="report formatting differences without writing files")
	parser.add_argument(
		"--clang-format",
		default=os.getenv("CLANG_FORMAT", "clang-format"),
		metavar="PATH",
		help="formatter executable (default: CLANG_FORMAT or clang-format)",
	)
	parser.add_argument("files", nargs="*", metavar="FILE",
		help="files to format (default: all project sources)")
	args = parser.parse_args()
	root = Path(__file__).resolve().parent.parent
	files = [Path(name) for name in args.files]

	if not files:
		files = sorted(path for tree in ("src", "tests")
			for path in (root / tree).rglob("*")
			if path.suffix == ".js" and path.is_file())
		files = sorted(set(files + python_files(root)))

	for path in files:
		if path.suffix not in (".js", ".py"):
			parser.error(f"unsupported source type: {path}")

	failed = False

	for filename in files:
		path = Path(filename)
		original = path.read_text()

		try:
			if path.suffix == ".py":
				formatted = format_python(original)
			else:
				formatted = FORMATTERS[path.suffix](
					original, path, args.clang_format)
		except (OSError, SyntaxError, ValueError, subprocess.CalledProcessError) as error:
			parser.exit(1, f"{path}: {error}\n")

		if args.check:
			if original != formatted:
				print(f"{path}: run python3 tools/format.py")
				failed = True
		elif original != formatted:
			path.write_text(formatted)

		# ColumnLimit is a wrapping target. Keep literal bytes and scopes
		# intact even where a diagnostic or deeply nested call exceeds it.
	return int(failed)


if __name__ == "__main__":
	raise SystemExit(main())
