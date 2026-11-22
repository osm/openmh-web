# OpenMH Web

OpenMH Web is the browser interface for [OpenMH](https://github.com/osm/openmh).
Use the Game library to prepare your Motorhead files or select an existing
`.ass` package for single player or multiplayer.

## Build and run

Download the Wasm release archive that matches `runtime.lock.json` from the
[OpenMH releases](https://github.com/osm/openmh/releases).
Build and serve the site locally with Python 3.11 or newer.

```sh
./scripts/build --openmh-wasm ~/Downloads/openmh-1.0.0-wasm.tar.gz
python3 -m http.server 8000 --bind 127.0.0.1 --directory build/site
```

Open [localhost:8000](http://localhost:8000/) to play. To bundle a demo, add
`--demo /path/to/demo.ass` to the build command. Use `./scripts/build --help`
for other options. `./scripts/check` checks formatting and runs the unit tests.

## Deploy

Run `./scripts/release`, then extract the `.tar.gz` from `build/packages/`
into your web root. Serve the site over HTTPS and `.wasm` files as
`application/wasm`. Keep previous `code/` directories when updating so open
tabs can finish loading.
