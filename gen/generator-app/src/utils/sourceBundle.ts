import { rtlSourcesFor, sourceVersions, type SchedulerConfig } from './rtlGenerator';

const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// The source files are small, so ZIP's store method keeps the bundle dependency-free.
export function createZip(files: Record<string, string>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let fileCount = 0;

  for (const [path, source] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(source);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 12, 0x0021);
    write32(localView, 14, checksum);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 14, 0x0021);
    write32(centralView, 16, checksum);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, name.length);
    write32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);

    localOffset += local.length + data.length;
    fileCount++;
  }

  const centralDirectory = join(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, fileCount);
  write16(endView, 10, fileCount);
  write32(endView, 12, centralDirectory.length);
  write32(endView, 16, localOffset);
  return join([...localParts, centralDirectory, end]);
}

function safeProjectName(projectName: string): string {
  return projectName.trim().normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '') || 'project';
}

// Preserve upstream sources verbatim; custom mode adds a derived scheduler
// whose only changes are its module name and the LSQ instantiation target.
export function generateCustomScheduler(): string {
  const source = rtlSourcesFor('oryukdo')['oryukdo_scheduler_integrated.sv'];
  if ((source.match(/oryukdo_load_store_queue #\(/g) ?? []).length !== 1)
    throw new Error('Gen3 LSQ instantiation changed');
  return source.replace('module oryukdo_gen3_scheduler', 'module oryukdo_gen3_custom_scheduler')
    .replace('oryukdo_load_store_queue #(', 'oryukdo_custom_lsq #(');
}

export function generateCustomLsqTemplate(): string {
  const source = rtlSourcesFor('oryukdo')['oryukdo_load_store_queue.sv'];
  const end = source.indexOf('\n);');
  if (end < 0) throw new Error('Gen3 LSQ header not found');
  const header = source.slice(source.indexOf('module '), end + 3)
    .replace('module oryukdo_load_store_queue', 'module oryukdo_custom_lsq');
  const parameters = [...header.matchAll(/\bparameter int (\w+)\s*=/g)].map(match => match[1]);
  // Expand grouped parameter declarations too (EX_PATH_W, MICROOP_W, ...).
  for (const name of ['MICROOP_W', 'IMM_W', 'PHY_W'])
    if (!parameters.includes(name)) parameters.push(name);
  const ports = [...header.matchAll(/^\s*(?:input|output)\s+(?:wire|logic)\s+(?:\[[^\]]+\]\s+)?(\w+(?:\s*,\s*\w+)*),?\s*$/gm)]
    .flatMap(match => match[1].split(',').map(name => name.trim()));
  if (ports.length !== 25) throw new Error('Gen3 LSQ port list changed');
  return `// Gen3 starter: replace the body, retaining the recovery/ordering contract.
// See INTEGRATION.md. Compile exactly one oryukdo_custom_lsq definition.
${header}
    oryukdo_load_store_queue #(
${parameters.map(name => `        .${name}(${name})`).join(',\n')}
    ) U_REFERENCE (
${ports.map(name => `        .${name}(${name})`).join(',\n')}
    );
endmodule
`;
}

export const oryukdoIntegrationGuide = `# ORYUKDO Gen3 integration

Top: oryukdo_example_top wraps oryukdo_gen3_scheduler. Supply frontend, EX,
data RF, memory/MMU and CSR logic. This ZIP is a scheduler, not a complete CPU.
Gen2 ORYUKDO token/epoch, i_decode_*, i_agu_* and o_wb_* interfaces are obsolete.

## Fetch and decode
Echo each requested {Flow ID, PC} from o_im_req_pc on i_im_recv_pc. Hold
i_im_recv_inst_valid/pc/inst until o_im_recv_inst_get. Generated decode reads
i_im_recv_inst; external decode also supplies all ten i_nel_decode_* buses.
The generated decoder reports illegal instruction via i_nel_decode_exception.
Additional execution/MMU faults use i_exception_valid/tag/phyreg/cause/tval.
Those inputs are transfer pulses; report the original tag and destination PHY
(zero when there is no destination), including faults without a normal WBC.
Do not invent a separate frontend-fault cause port: the pinned core has none.

## Execution, completion and recovery
Accept o_rs_entry_data on o_rs_entry_valid && i_rs_entry_get. Packed MSB to LSB:
{source_phyregs, dest_phyreg, immediate, microop, expath, Flow ID, PC}.
WBC completion is {dest_phyreg, Flow ID, PC}; i_wbc_result_valid/data is a pulse,
not a ready/retry interface. Only accepted o_wbc_accept lanes may write the RF.
Instructions without destinations, including stores, complete with rd=0.
Branch results separately report {resolved_next_PC, original Flow ID, PC}.
Honor o_backend_kill_valid/inclusive/tag and o_backend_oldest_flow in external
execution and pending memory work; do not recycle stale completions. Tie the
diagnostic i_oryukdo_issue_kill/result_kill overrides low in normal integration.

## LSQ and side effects
LSQ depth defaults to 32 independently of IST entries. It serializes the chosen
EX path using ordered and ready FIFOs; at most one matching memory command is
in flight. Memory/AGU/data buses remain external. This is not a store-forwarding
memory engine. Report completion only when the next memory command may start.
Store/CSR/MMIO publication must follow the side-effect commit handshake.
i_sidefx_valid/tag reports prepared side effects (transfer pulses, not requests).
Preparation alone must not send normal WBC completion.
Match o_sidefx_valid/tag/slot, accept via i_sidefx_ready, and acknowledge through
i_sidefx_done. Success also returns normal WBC exactly once; errors use
i_sidefx_done/error/cause/tval without duplicate normal WBC. Precise failures
require no partial external write. Trap CSR requests complete through i_trap_csr_done; supply trap
vector and interrupt eligibility externally. Commit width follows decodeWidth.

Custom mode exports RTL/custom_lsq/oryukdo_custom_lsq.sv and a derived scheduler.
Pinned sources remain byte-identical. The starter calls oryukdo_load_store_queue.
Replace its body while preserving every parameter and port. i_order_valid/tag
are transfer pulses after o_order_ready; ready/ex use valid/get. Preserve paired
FIFO reservations until matching i_done_valid/tag, recovery boundary filtering,
discard notifications and cancel-PHY wakeups. DEPTH follows lsqEntries. Include
both custom files when compiling custom mode, with exactly one module definition.

## Predictor and reset
Static prediction is not-taken for conditional branches. External mode uses
o_predict_query_* / i_predict_query_ready and i_predict_response_* /
o_predict_response_ready. Return the original query tag and hold responses until
accepted; there is no static fallback. o_predict_update_* trains the predictor.
Default ASYNC_PORT_ISOLATION=1 is for a standalone boundary. For CPU integration
whose issue/WBC paths feed BRAM control, set scheduler.asyncPortIsolation=false.
Reset release is synchronized; respect valid/get and discard canceled work.
Keep SOURCE_VERSION.json and youngdo_config.json. Revalidate system behavior,
custom RTL and FPGA timing for your integration.
`;

export function projectTopFileName(projectName: string, platform: SchedulerConfig['platform'] = 'eulsukdo'): string {
  return `${safeProjectName(projectName)}_${platform === 'oryukdo' ? 'oryukdo' : 'eulsukdo'}_top.sv`;
}

export function buildSourceFiles(topSource: string, decoderSource: string | null, isaName: string, projectName: string, settingsJson: string, platform: SchedulerConfig['platform'] = 'eulsukdo'): Record<string, string> {
  const sources = rtlSourcesFor(platform);
  const settings = JSON.parse(settingsJson);
  if (settings.scheduler?.platform !== undefined && settings.scheduler.platform !== (platform ?? 'eulsukdo'))
    throw new Error('Settings platform differs from the selected source bundle');
  const projectDir = safeProjectName(projectName);
  const selected = platform ?? 'eulsukdo';
  const customLsq = selected === 'oryukdo' && settings.scheduler?.lsqMode === 'custom';
  return {
    [`${projectDir}/youngdo_config.json`]: settingsJson,
    ...(selected === 'oryukdo' ? { [`${projectDir}/INTEGRATION.md`]: oryukdoIntegrationGuide } : {}),
    [`${projectDir}/RTL/${projectTopFileName(projectName, platform)}`]: topSource,
    ...(decoderSource === null ? {} : { [`${projectDir}/RTL/${isaName}_decoder.sv`]: decoderSource }),
    [`${projectDir}/RTL/${selected}_rtl/SOURCE_VERSION.json`]: JSON.stringify(sourceVersions[selected], null, 2) + '\n',
    ...Object.fromEntries(Object.entries(sources).map(([name, source]) => [`${projectDir}/RTL/${selected}_rtl/${name}`, source])),
    ...(customLsq ? {
      [`${projectDir}/RTL/custom_lsq/oryukdo_custom_lsq.sv`]: generateCustomLsqTemplate(),
      [`${projectDir}/RTL/custom_lsq/oryukdo_gen3_custom_scheduler.sv`]: generateCustomScheduler(),
    } : {}),
    [`${projectDir}/RTL/ex_rtl/`]: '',
  };
}

export function buildSourceBundle(topSource: string, decoderSource: string | null, isaName: string, projectName: string, settingsJson: string, platform: SchedulerConfig['platform'] = 'eulsukdo'): Uint8Array {
  return createZip(buildSourceFiles(topSource, decoderSource, isaName, projectName, settingsJson, platform));
}

export function projectArchiveName(projectName: string, platform: SchedulerConfig['platform'] = 'eulsukdo'): string {
  return `${safeProjectName(projectName)}_${platform === 'oryukdo' ? 'oryukdo' : 'eulsukdo'}_rtl.zip`;
}

export function downloadSourceBundle(topSource: string, decoderSource: string | null, isaName: string, projectName: string, settingsJson: string, platform: SchedulerConfig['platform']) {
  const archive = buildSourceBundle(topSource, decoderSource, isaName, projectName, settingsJson, platform);
  const blob = new Blob([new Uint8Array(archive).buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = projectArchiveName(projectName, platform);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start saving the blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
