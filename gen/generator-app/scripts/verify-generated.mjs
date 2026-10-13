import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const utils = path.join(appRoot, 'src/utils');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youngdo-gen2-'));
const reportDir = path.join(appRoot, 'verification');
fs.mkdirSync(reportDir, { recursive: true });
let platformSources;
async function loadUtility(name) {
  let source = fs.readFileSync(path.join(utils, name), 'utf8');
  source = source.replace(/import (\w+) from '([^']+\.sv\?raw)';/g, (_, variable, reference) => {
    const rtl = fs.readFileSync(path.resolve(utils, reference.replace('?raw', '')), 'utf8');
    return `const ${variable} = ${JSON.stringify(rtl)};`;
  });
  if (name === 'rtlGenerator.ts') {
    source = source.replace(
      "import { rtlSourceSets, sourceVersions } from './platformSources';",
      `const rtlSourceSets = ${JSON.stringify(platformSources.rtlSourceSets)};
const sourceVersions = ${JSON.stringify(platformSources.sourceVersions)};`,
    );
  }
  if (name === 'sourceBundle.ts') {
    source = source.replace(
      "import { rtlSourcesFor, sourceVersions, type SchedulerConfig } from './rtlGenerator';",
      `import { rtlSourcesFor, sourceVersions } from './rtlGenerator.ts.mjs';`,
    );
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: name,
  }).outputText;
  const modulePath = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(modulePath, output);
  return import(pathToFileURL(modulePath).href);
}

platformSources = await loadUtility('platformSources.ts');
const { generateRTL, rtlSourcesFor, validateSchedulerConfig, sourceVersions } = await loadUtility('rtlGenerator.ts');
const { generateDecoderRTL } = await loadUtility('decoderGenerator.ts');
const { buildSourceBundle, projectArchiveName } = await loadUtility('sourceBundle.ts');
const example = JSON.parse(fs.readFileSync(path.join(appRoot, 'examples/rv32i_4decode_5issue.json'), 'utf8'));
try {
  const base = { ...example.scheduler, ...example.decoder, platform: 'eulsukdo', enableMemoryOrder: false };
  for (const extra of [{ platform: 'oryukdo' }, { enableMemoryOrder: true },
    { istBanks: 3 }, { rsFifoEntries: 0 }, { istIssueWidth: 0 }, { istBanks: null }, { rsFifoEntries: '8' },
    { prmBuffer: 0 }, { prmUpdate: 1.5 }, { unallocatePhyreg: -1 }, { flowWindows: 1 },
    { flowPcMaxRange: 0 }, { flowPcMaxRange: null }]) {
    assert.ok(validateSchedulerConfig({ ...base, ...extra }));
    assert.throws(() => generateRTL({ ...base, ...extra }));
  }
  assert.throws(() => rtlSourcesFor('oryukdo'));
  assert.throws(() => buildSourceBundle('', null, 'rv32i', 'sample', '{}', 'oryukdo'));
  assert.throws(() => buildSourceBundle('', null, 'rv32i', 'sample', JSON.stringify({ scheduler: { enableMemoryOrder: true } }), 'eulsukdo'));
  assert.deepEqual(Object.keys(platformSources.rtlSourceSets), ['eulsukdo']);
  for (const [name, data] of Object.entries(rtlSourcesFor('eulsukdo'))) {
    assert.equal(createHash('sha256').update(data).digest('hex'), sourceVersions.eulsukdo.sha256[name]);
  }
  for (const [profile, extra] of [
    ['default_2d5i', { decodeWidth: 2, robEntries: 128, prmUpdate: 5 }],
    ['external_decoder', { decoderSource: 'external' }],
    ['1d3i', { decodeWidth: 1, coresList: example.scheduler.coresList.map(core => ({ ...core, count: 1 })) }],
    ['4d7i', { decodeWidth: 4, prmUpdate: 7, coresList: example.scheduler.coresList.map(core => ({ ...core, count: core.name === 'ALU' ? 5 : 1 })) }],
    ['custom_banks_fifo', { decodeWidth: 2, robEntries: 17, rsFifoEntries: 8, istIssueWidth: 3, istBanks: 4 }],
    ['detailed_parameters', { decodeWidth: 2, prmBuffer: 8, prmUpdate: 2, unallocatePhyreg: 3, flowWindows: 3, flowPcMaxRange: 7 }],
  ]) {
    const config = { ...base, ...extra };
    const error = validateSchedulerConfig(config);
    if (error) throw new Error(`${profile}: ${error}`);
    const top = generateRTL(config);
    for (const [parameter, value] of Object.entries({
      STRUCT_PRM_ENTRY_BUFFER: config.prmBuffer, STRUCT_PRM_ENTRY_UPDATE: config.prmUpdate,
      STRUCT_UNALLOCATE_PHYREG: config.unallocatePhyreg, STRUCT_FLOW_WINDOWS: config.flowWindows,
      STRUCT_FLOW_PC_MAX_RANGE: config.flowPcMaxRange ?? 16,
    })) {
      assert.match(top, new RegExp(`parameter int ${parameter}\\s*=\\s*${value},`));
      assert.equal(top.split(`.${parameter}(${parameter})`).length - 1, 1, `${profile}: ${parameter} must be forwarded exactly once`);
    }
    const decoder = generateDecoderRTL(example.decoder, example.formats, example.instructions, config.coresList);
    assert.ok(!top.includes('ENABLE_MEMORY_ORDER') && !top.includes('ENABLE_RECOVERY_TRACKING'));
    for (const parameter of ['STRUCT_IST_ISSUE_WIDTH', 'STRUCT_IST_BANKS', 'STRUCT_RS_FIFO_WIDTH']) {
      assert.ok(top.includes(`.${parameter}(${parameter})`), `${profile}: ${parameter} not forwarded`);
    }
    const rtlSources = rtlSourcesFor(config.platform);
    assert.equal(Object.keys(rtlSources).length, 8);
    assert.ok(!rtlSources['memory_order_queue.sv'] && !rtlSources['new_entry_logic_agent.sv']);
    assert.equal(sourceVersions.eulsukdo.path, 'gen2/src/RTL');
    assert.equal(sourceVersions.eulsukdo.commit.length, 40);
    const archive = buildSourceBundle(top, extra.decoderSource === 'external' ? null : decoder,
      config.isaName, 'sample', JSON.stringify({ scheduler: config }), config.platform);
    fs.writeFileSync(path.join(reportDir, `${profile}.zip`), archive);
    const zipText = new TextDecoder().decode(archive);
    assert.ok(zipText.includes(sourceVersions.eulsukdo.commit));
    assert.ok(zipText.includes('RTL/eulsukdo_rtl/eulsukdo_scheduler.sv'));
    assert.ok(!zipText.includes('memory_order_queue.sv') && !zipText.includes('oryukdo_rtl'));
    assert.equal(zipText.includes('RTL/rv32i_decoder.sv'), extra.decoderSource !== 'external');
    assert.equal(projectArchiveName('sample'), 'sample_eulsukdo_rtl.zip');
    if (extra.decoderSource === 'external' &&
        (top.includes('GEN_DECODER') || !/input\s+wire\s+.*i_nel_decode_rd/.test(top)))
      throw new Error(`${profile}: external decode ports are not exposed`);
    const files = { 'generated_top.sv': top, 'generated_decoder.sv': decoder, ...rtlSources };
    const paths = Object.entries(files).map(([filename, data]) => {
      const output = path.join(dir, profile, filename);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, data);
      return output;
    });
    const wsl = process.platform === 'win32' && !process.env.VERILATOR_BIN;
    const linuxPath = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
    // Preserve upstream RTL. Existing UNOPTFLAT warnings remain visible in logs;
    // interface errors and all other unsuppressed warning categories stay fatal.
    const args = ['--lint-only', '-Wno-WIDTH', '-Wno-fatal', '--unroll-count', '256', '--top-module', 'eulsukdo_example_top',
      ...paths.map(file => wsl ? linuxPath(file) : file)];
    const result = spawnSync(wsl ? 'wsl.exe' : process.env.VERILATOR_BIN ?? 'verilator',
      wsl ? ['--exec', 'verilator', ...args] : args, { encoding: 'utf8' });
    if (result.error) throw new Error(`${profile}: Verilator could not start: ${result.error.message}`);
    fs.writeFileSync(path.join(reportDir, `${profile}.log`), `${result.stdout}${result.stderr}`);
    if (result.status !== 0) throw new Error(`${profile} generated top failed lint:\n${result.stdout}${result.stderr}`);
    const unexpected = [...result.stderr.matchAll(/%Warning-([A-Z0-9_]+):/g)].filter(match => match[1] !== 'UNOPTFLAT');
    assert.equal(unexpected.length, 0, `${profile}: unexpected lint warnings; see verification/`);
    const warnings = (result.stderr.match(/%Warning-UNOPTFLAT:/g) ?? []).length;
    console.log(`${profile}: generated top and ${Object.keys(rtlSources).length} RTL sources checked (${warnings} upstream UNOPTFLAT warnings; see verification/)`);
  }
  console.log('Feature guards, parameter forwarding, source hashes and ZIP contents passed');
} finally {
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'youngdo-gen2-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
