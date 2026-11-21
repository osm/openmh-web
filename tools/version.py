"""Validate website release versions before using them in archive names."""

import re


def validate_version(value):
	if not isinstance(value, str) or not re.fullmatch(
		r'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?', value):
		raise ValueError('Invalid website version: expected X.Y.Z or X.Y.Z-label')

	return value
