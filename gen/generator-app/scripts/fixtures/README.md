# Upstream ORYUKDO Gen3 regressions

`tb_gen3.sv`, `tb_branch_recovery.sv` and `tb_protocols.sv` are copied byte-for-byte
from `VARZero/ORYUKDO`, commit `65a06e6595cb1030bdebd363f23249f9ad4650b0`, under `tests/`.

`verify-generated.mjs` adapts only the scheduler module name and hierarchical
references (including the custom starter's U_REFERENCE) when running the architectural scoreboard through the generated
external-decoder wrapper. Both predictor modes and both LSQ modes run with the
actual exported files; custom mode uses the exported starter and derived scheduler.
The built-in/static run also covers warm reset, seeded runs, 25,000 commits and
four exception/recovery collision scenarios. Checkpoint and protocol benches
run against the matching pinned source modules. Fixture files remain unchanged.

When refreshing ORYUKDO, update fixtures explicitly and record the source commit.
