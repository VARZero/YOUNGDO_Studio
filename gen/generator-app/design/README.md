# ORYUKDO generator concept

`oryukdo_generator_concept.svg` is an editable 1600 × 1000 UI proposal;
`oryukdo_generator_concept.png` is its preview. It is not wired to the React
generator and none of its displayed checks represent a completed generated
project.

The left column selects the EULSUKDO/ORYUKDO platform and core shape. Decode
width uses a numeric stepper rather than a slider. The
center presents the fetch-to-EX route, key/age completion, ordered retirement,
store gate and recovery redirect. The right column exposes replaceable
predictor, EX and CSR sockets, followed by configuration checks and export
contents. In the example profile, the EX path order is ALU ×3, Branch ×1 and
Memory ×1, with WBC lane 4 reserved for the LSQ.

Implementation order for the existing app:

1. Add an explicit platform profile and serialize it with the configuration.
2. Bundle the existing recovery RTL modules and connect the recovery parameters
   in the generated top; preserve the static-not-taken predictor fallback.
3. Define stable per-EX key, age, accept and flush adapters, plus predictor and
   CSR connections. Keep user-provided EX/CSR implementations external.
4. Validate EX issue/WBC totals, the reserved memory lane, physical register
   and frontier capacity, and compatible option combinations.
5. Lint the **generated** top and full ZIP source set for each supported preset.

The displayed verification marks are design placeholders until step 5 exists.
