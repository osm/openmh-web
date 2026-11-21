"""Build small synthetic runtime exports for website packaging tests."""

import hashlib
import json

from tools.runtime import EXTRACTOR_FILES, PLAYER_SCRIPTS


def write_runtime(directory, version, extractor=False):
	names = [*PLAYER_SCRIPTS, 'licenses.txt', 'package-check.js', 'openmotor.wasm']

	if extractor:
		names.extend(EXTRACTOR_FILES)

	files = {}

	for name in names:
		content = b'wasm' if name.endswith('.wasm') else name.encode()
		(directory / name).write_bytes(content)
		files[name] = hashlib.sha256(content).hexdigest()

	manifest = dict(format=1, version=version, extractor=extractor,
		testing=False, scripts=list(PLAYER_SCRIPTS), files=files)
	(directory / 'runtime.json').write_text(json.dumps(manifest))

	return manifest
