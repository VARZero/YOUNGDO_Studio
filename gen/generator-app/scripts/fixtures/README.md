# Upstream ORYUKDO regression

`tb_oryukdo_scheduler.sv` and `tb_oryukdo_frontier.sv` is copied byte-for-byte from
`VARZero/ORYUKDO`, commit `84e07b64b525b9d243b74641a1e59bb1337f4f52`,
under `gen2/src/TB/`.

`verify-generated.mjs` instantiates the generated external-decode wrapper in
place of the scheduler and redirects its internal assertions through
`U_SCHEDULER_CORE`. It runs built-in/custom LSQ with both static and external
prediction. A fifth run substitutes the exported starter for the test-only
custom implementation and removes its stall-injection task; the complete
public recovery/memory regression still runs through the exported starter.
The fixture itself remains unchanged. Update it explicitly when refreshing
the pinned ORYUKDO platform; keep the originating revision documented here.

The frontier fixture runs against the bundled RTL at depths 3 and 4. It checks
ordered side-effect boundaries and stable-token acceptance without CPU-specific
patches or changes to the public scheduler ports.
