#!/usr/bin/env python3
"""Run OpenMH development checks."""

from pathlib import Path
import sys

# A single package root also supports invocation from another working directory.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.checks.runner import main

if __name__ == '__main__':
	raise SystemExit(main(ROOT / 'tests/checks', 'tests.checks',
		'scripts/check integration'))
