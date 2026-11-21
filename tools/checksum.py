"""Compute checksums for website build inputs and release files."""

import hashlib


def file_sha256(path):
	with path.open('rb') as stream:
		return hashlib.file_digest(stream, 'sha256').digest()
