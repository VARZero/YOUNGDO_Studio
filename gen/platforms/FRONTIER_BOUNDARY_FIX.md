# ORYUKDO frontier update (2026-10-29)

ORYUKDO is pinned to `84e07b64b525b9d243b74641a1e59bb1337f4f52`.
The source is copied from the existing `VARZero/ORYUKDO` repository, not patched
inside Studio. EULSUKDO remains at `9b0e1c6b792b132f05844c3113ff8dfde712cd77`.

The upstream change prevents younger CSR/MMIO side effects before a drained
branch/interrupt boundary resolves. It also makes serial-token array dependencies
explicit for XSim and declares the scheduler's backend reset before its use.
There are no public port, configuration, LSQ selection or predictor changes.
See the [upstream cause, negative controls and 23 Verilator / 8 XSim results](https://github.com/VARZero/ORYUKDO/blob/84e07b64b525b9d243b74641a1e59bb1337f4f52/docs/FRONTIER_BOUNDARY_FIX.md).

Both Studio and `auto_create/` use the same pinned source bundle. Exported
`SOURCE_VERSION.json` contains the commit and exact SHA-256 of all 17 ORYUKDO
files. `sync_platforms.py` and `platformSources.ts` retain that provenance.

Reproduce the update from the adjacent existing repository:

```sh
python3 gen/scripts/sync_platforms.py --platform oryukdo --local-repo ../ORYUKDO --ref 84e07b64b525b9d243b74641a1e59bb1337f4f52
cd gen/generator-app
npm ci
npm run lint
npm run build
npm run verify:rtl
npm run verify:auto
```

`verify:rtl` adds four functional frontier cases (boundary and stable-token tests
at depths 3 and 4) to the existing 18 generated configurations, decoder bridge,
and five generated-wrapper scheduler simulations. The upstream fixtures are
copied without edits; their revision is recorded in `scripts/fixtures/README.md`.
`verify:auto` additionally compares the browser-exported revision and every
ORYUKDO RTL hash with the checked-in lock file, alongside the existing Studio /
auto-create round-trip, per-file, custom LSQ and mobile checks.

FPGA synthesis, place-and-route and physical board execution were not rerun.
Older 70 MHz numbers are not measurements of this update.
