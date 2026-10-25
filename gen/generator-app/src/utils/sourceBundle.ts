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
  return {
    [`${projectDir}/youngdo_config.json`]: settingsJson,
    ...(selected === 'oryukdo' ? { [`${projectDir}/INTEGRATION.md`]: `# ORYUKDO Gen2 integration

Top: oryukdo_example_top. This is a scheduler, not a complete CPU.
Supply frontend, EX units, data RF, MMU and CSR executor.

Generated decode consumes i_instruction. The frontend MUST also supply
i_decode_store, i_decode_csr and i_decode_end, plus PC/epoch/valid.
Memory classification follows the configured memory path. Keep CSR distinct
from memory. i_frontend_exception/cause reports fetch faults, taking priority
over generated illegal-instruction cause 2. External decode supplies every
i_decode_* field directly. Hold lanes until o_decode_get accepts them and
follow o_fetch_pc, o_fetch_epoch and o_flush; discard canceled EX work.

Normal EX returns its original slot/generation token on i_result_* and holds
results until o_result_accept. Memory EX instead returns token, address, data,
mask and MMU checks through i_agu_*. Do not complete a memory operation twice.
Write the data RF ONLY on o_wb_valid using o_wb_phy/data/uop; o_result_accept
is queue admission, not RF write permission. Internal Ready follows RF writes.

Memory ordering is always present and capacity follows frontier entries.
Mark MMIO/side-effecting accesses with i_agu_nonspec. External store publication
is ordered. A precise store fault requires no partially visible external write.
CSR runs at ordered issue; external CSR logic handles trap state and interrupt
eligibility. Interrupts are taken at confirmed window boundaries.

Static prediction selects the sequential PC. External prediction waits for a
response matching the requested PC and epoch, with NO static fallback.
PC/data widths are 32, PC step is 4, generation/epoch widths are 32 bits.
Keep SOURCE_VERSION.json and youngdo_config.json for reproducibility.
` } : {}),
    [`${projectDir}/RTL/${projectTopFileName(projectName, platform)}`]: topSource,
    ...(decoderSource === null ? {} : { [`${projectDir}/RTL/${isaName}_decoder.sv`]: decoderSource }),
    [`${projectDir}/RTL/${selected}_rtl/SOURCE_VERSION.json`]: JSON.stringify(sourceVersions[selected], null, 2) + '\n',
    ...Object.fromEntries(Object.entries(sources).map(([name, source]) => [`${projectDir}/RTL/${selected}_rtl/${name}`, source])),
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
