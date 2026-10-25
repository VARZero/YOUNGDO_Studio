# Upstream ORYUKDO regression

`tb_oryukdo_scheduler.sv` is copied byte-for-byte from
`VARZero/ORYUKDO`, commit `2918338440252904a53acdcbfea30a6e484bccbc`,
path `gen2/src/TB/tb_oryukdo_scheduler.sv`.

`verify-generated.mjs` instantiates the generated external-decode wrapper in
place of the scheduler and redirects its internal assertions through
`U_SCHEDULER_CORE`. It runs built-in/custom LSQ with both static and external
prediction. A fifth run substitutes the exported starter for the test-only
custom implementation and removes its stall-injection task; the complete
public recovery/memory regression still runs through the exported starter.
The fixture itself remains unchanged. Update it explicitly when refreshing
the pinned ORYUKDO platform; keep the originating revision documented here.
