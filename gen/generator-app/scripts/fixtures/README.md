# Upstream ORYUKDO regression

`tb_oryukdo_scheduler.sv` is copied byte-for-byte from
`VARZero/ORYUKDO`, commit `844267fe25b0ab82f16dfcf4db87005c560eba01`,
path `gen2/src/TB/tb_oryukdo_scheduler.sv`.

`verify-generated.mjs` instantiates the generated external-decode wrapper in
place of the scheduler and redirects its internal assertions through
`U_SCHEDULER_CORE`. It runs both static and external prediction configurations.
The fixture itself remains unchanged. Update it explicitly when refreshing
the pinned ORYUKDO platform; keep the originating revision documented here.
