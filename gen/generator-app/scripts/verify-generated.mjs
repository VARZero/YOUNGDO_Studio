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
  for (const extra of [{ platform: 'invalid' }, { enableMemoryOrder: true },
    { enableMemoryOrder: true, memoryCoreId: 'missing' },
    { enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 3 },
    { enableMemoryOrder: 'true' }, { lsqEntries: 0 }, { lsqEntries: 2.5 }, { lsqEntries: null }, { lsqEntries: '32' },
    { istBanks: 3 }, { rsFifoEntries: 0 }, { istIssueWidth: 0 }, { istBanks: null }, { rsFifoEntries: '8' },
    { prmBuffer: 0 }, { prmUpdate: 1.5 }, { unallocatePhyreg: -1 }, { flowWindows: 1 },
    { flowPcMaxRange: 0 }, { flowPcMaxRange: null }]) {
    assert.ok(validateSchedulerConfig({ ...base, ...extra }));
    assert.throws(() => generateRTL({ ...base, ...extra }));
  }
  assert.throws(() => rtlSourcesFor('invalid'));

  assert.throws(() => buildSourceBundle('', null, 'rv32i', 'sample', JSON.stringify({ scheduler: { platform: 'oryukdo' } }), 'eulsukdo'));
  assert.deepEqual(Object.keys(platformSources.rtlSourceSets), ['eulsukdo', 'oryukdo']);
  for (const platform of ['eulsukdo','oryukdo']) for (const [name, data] of Object.entries(rtlSourcesFor(platform))) {
    assert.equal(createHash('sha256').update(data).digest('hex'), sourceVersions[platform].sha256[name]);
  }
  for (const [profile, extra] of [
    ['default_2d5i', { decodeWidth: 2, robEntries: 128, prmUpdate: 5 }],
    ['external_decoder', { decoderSource: 'external' }],
    ['1d3i', { decodeWidth: 1, coresList: example.scheduler.coresList.map(core => ({ ...core, count: 1 })) }],
    ['4d7i', { decodeWidth: 4, prmUpdate: 7, coresList: example.scheduler.coresList.map(core => ({ ...core, count: core.name === 'ALU' ? 5 : 1 })) }],
    ['custom_banks_fifo', { decodeWidth: 2, robEntries: 17, rsFifoEntries: 8, istIssueWidth: 3, istBanks: 4 }],
    ['detailed_parameters', { decodeWidth: 2, prmBuffer: 8, prmUpdate: 2, unallocatePhyreg: 3, flowWindows: 3, flowPcMaxRange: 7 }],
    ['lsq_2d5i', { decodeWidth: 2, enableMemoryOrder: true, memoryCoreId: '3' }],
    ['lsq_external', { decoderSource: 'external', enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 7 }],
    ['lsq_minimal', { decodeWidth: 1, enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 1 }],
    ['lsq_reordered_multilane', { enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 17,
      coresList: [example.scheduler.coresList[1], { ...example.scheduler.coresList[2], count: 2 }, example.scheduler.coresList[0]] }],
  ]) {
    const config = { ...base, ...extra };
    const error = validateSchedulerConfig(config);
    if (error) throw new Error(`${profile}: ${error}`);
    const top = generateRTL(config);
    for (const [parameter, value] of Object.entries({
      STRUCT_PRM_ENTRY_BUFFER: config.prmBuffer, STRUCT_PRM_ENTRY_UPDATE: config.prmUpdate,
      STRUCT_UNALLOCATE_PHYREG: config.unallocatePhyreg, STRUCT_FLOW_WINDOWS: config.flowWindows,
      STRUCT_FLOW_PC_MAX_RANGE: config.flowPcMaxRange ?? 16,
      STRUCT_LSQ_ENTRIES: config.lsqEntries ?? 32,
      STRUCT_LSQ_EX_PATH: profile === 'lsq_reordered_multilane' ? 1 : 2,
    })) {
      assert.match(top, new RegExp(`parameter int ${parameter}\\s*=\\s*${value},`));
      assert.equal(top.split(`.${parameter}(${parameter})`).length - 1, 1, `${profile}: ${parameter} must be forwarded exactly once`);
    }
    const decoder = generateDecoderRTL(example.decoder, example.formats, example.instructions, config.coresList);
    assert.match(top, new RegExp(`parameter bit ENABLE_LSQ\\s*=\\s*1'b${config.enableMemoryOrder ? 1 : 0},`));
    assert.equal(top.split('.ENABLE_LSQ(ENABLE_LSQ)').length - 1, 1);
    assert.ok(!top.includes('ENABLE_MEMORY_ORDER') && !top.includes('ENABLE_RECOVERY_TRACKING'));
    for (const parameter of ['STRUCT_IST_ISSUE_WIDTH', 'STRUCT_IST_BANKS', 'STRUCT_RS_FIFO_WIDTH']) {
      assert.ok(top.includes(`.${parameter}(${parameter})`), `${profile}: ${parameter} not forwarded`);
    }
    const rtlSources = rtlSourcesFor(config.platform);
    assert.equal(Object.keys(rtlSources).length, 9);
    assert.ok(rtlSources['load_store_queue.sv']);
    assert.ok(!rtlSources['memory_order_queue.sv'] && !rtlSources['new_entry_logic_agent.sv']);
    assert.equal(sourceVersions.eulsukdo.path, 'gen2/src/RTL');
    assert.equal(sourceVersions.eulsukdo.commit.length, 40);
    const archive = buildSourceBundle(top, extra.decoderSource === 'external' ? null : decoder,
      config.isaName, 'sample', JSON.stringify({ scheduler: config }), config.platform);
    fs.writeFileSync(path.join(reportDir, `${profile}.zip`), archive);
    const zipText = new TextDecoder().decode(archive);
    assert.ok(zipText.includes(sourceVersions.eulsukdo.commit));
    assert.ok(zipText.includes('RTL/eulsukdo_rtl/eulsukdo_scheduler.sv'));
    assert.ok(zipText.includes('RTL/eulsukdo_rtl/load_store_queue.sv'));
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

  const oryBase = { ...base, platform: 'oryukdo', robEntries: 32, decodeWidth: 2,
    prmBuffer: 4, unallocatePhyreg: 1, enableMemoryOrder: true, memoryCoreId: '3' };
  for (const extra of [{ enableMemoryOrder: false }, { prmBuffer: 8 }, { unallocatePhyreg: 4 },
    { istBanks: 4 }, { lsqEntries: 7 }, { phyRegs: 33 }, { memoryCoreId: 'missing' }]) {
    assert.ok(validateSchedulerConfig({ ...oryBase, ...extra }));
    assert.throws(() => generateRTL({ ...oryBase, ...extra }));
  }
  const wsl = process.platform === 'win32' && !process.env.VERILATOR_BIN;
  const linuxPath = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
  const toolPath = value => wsl ? linuxPath(value) : value;
  function runVerilator(label, args) {
    const result = spawnSync(wsl ? 'wsl.exe' : process.env.VERILATOR_BIN ?? 'verilator',
      wsl ? ['--exec', 'verilator', ...args] : args, { encoding: 'utf8', maxBuffer: 32*1024*1024 });
    fs.writeFileSync(path.join(reportDir, `${label}.log`), `${result.stdout}${result.stderr}`);
    assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\\n${result.stderr}`);
    const unexpected = [...result.stderr.matchAll(/%Warning-([A-Z0-9_]+):/g)].filter(match => match[1] !== 'UNOPTFLAT');
    assert.equal(unexpected.length, 0, `${label}: unexpected warnings`);
  }
  for (const [profile, extra] of [
    ['ory_static', {}], ['ory_predictor', { predictorMode: 'external' }],
    ['ory_external_decode', { decoderSource: 'external' }],
    ['ory_external_both', { decoderSource: 'external', predictorMode: 'external' }],
    ['ory_1d3i', { decodeWidth: 1, robEntries: 17, phyRegs: 34, rsFifoEntries: 7, flowWindows: 3,
      coresList: base.coresList.map(core => ({ ...core, count: 1 })) }],
    ['ory_reordered_3d7i', { decodeWidth: 3, prmUpdate: 3, istIssueWidth: 4,
      coresList: [base.coresList[1], { ...base.coresList[2], count: 3 }, { ...base.coresList[0], count: 1 }] }],
  ]) {
    const config = { ...oryBase, ...extra };
    assert.equal(validateSchedulerConfig(config), null, profile);
    const top = generateRTL(config);
    const decoder = generateDecoderRTL(example.decoder, example.formats, example.instructions, config.coresList);
    for (const [parameter, value] of Object.entries({ DECODE: config.decodeWidth, PHY: config.phyRegs,
      ARCH: config.instRegs, ENTRIES: config.robEntries, WINDOWS: config.flowWindows,
      WINDOW_SIZE: config.flowPcMaxRange ?? 16, UPDATES: config.prmUpdate, RS_DEPTH: config.rsFifoEntries ?? 128,
      PATHS: config.coresList.length, EX_LANES: config.coresList.reduce((sum, core) => sum + core.count, 0) })) {
      assert.match(top, new RegExp(`\\b${parameter}\\s*=\\s*${value}\\b`), profile);
      assert.equal(top.split(`.${parameter}(${parameter})`).length - 1, 1, parameter);
    }
    assert.ok(top.includes(`EXTERNAL_PREDICTOR=1'b${config.predictorMode === 'external' ? 1 : 0}`));
    assert.ok(top.includes('.EXTERNAL_PREDICTOR(EXTERNAL_PREDICTOR)'));
    assert.equal(top.includes('GEN_DECODER'), config.decoderSource !== 'external');
    if (config.decoderSource !== 'external') {
      assert.ok(top.includes(`==PATH_W'(${config.coresList.findIndex(core => core.id === config.memoryCoreId)})`));
      for (const port of ['i_decode_store','i_decode_csr','i_decode_end','i_frontend_exception','i_frontend_cause','i_instruction'])
        assert.match(top, new RegExp(`input wire [^\\n]* ${port}[,\\n]`));
    }
    const rtl = rtlSourcesFor('oryukdo');
    assert.equal(Object.keys(rtl).length, 17);
    const archive = buildSourceBundle(top, config.decoderSource === 'external' ? null : decoder,
      config.isaName, 'sample', JSON.stringify({ scheduler: config }), 'oryukdo');
    const zipText = new TextDecoder().decode(archive);
    assert.ok(zipText.includes(sourceVersions.oryukdo.commit));
    assert.ok(zipText.includes('RTL/oryukdo_rtl/oryukdo_dependency_mapper.sv'));
    assert.ok(!zipText.includes('RTL/eulsukdo_rtl/'));
    assert.equal(zipText.includes('RTL/rv32i_decoder.sv'), config.decoderSource !== 'external');
    fs.writeFileSync(path.join(reportDir, `${profile}.zip`), archive);
    const target = path.join(dir, profile);fs.mkdirSync(target);
    const paths = Object.entries({ 'top.sv': top, 'decoder.sv': decoder, ...rtl }).map(([name, data]) => {
      const filename=path.join(target,name);fs.writeFileSync(filename,data);return toolPath(filename);
    });
    runVerilator(profile, ['--lint-only','-Wno-WIDTH','-Wno-fatal','--unroll-count','256',
      '--top-module','oryukdo_example_top',...paths]);
    console.log(`${profile}: parameter forwarding, source hashes, ZIP and lint passed`);
  }
  // Check actual generated ISA decoding and frontend metadata/fault priority.
  {
    const target=path.join(dir,'ory_decoder_bridge');fs.mkdirSync(target);
    const top=generateRTL(oryBase);
    const connections={i_instruction:'instructions',i_frontend_exception:'fetch_fault',
      i_frontend_cause:'fetch_cause',i_decode_store:"2'b10",i_decode_csr:"2'b01",i_decode_end:"2'b10"};
    const ports=[...top.matchAll(/^\s*(input|output)\s+(?:wire|logic)\s+(?:\[[^\]]+\]\s+)?(\w+),?\s*$/gm)];
    const bench=`module tb_ory_decoder_bridge;
      logic [63:0] instructions=0;
      logic [1:0] fetch_fault=0;
      logic [9:0] fetch_cause=0;
      oryukdo_example_top dut(${ports.map(([,direction,name])=>`.${name}(${direction==='output'?'':connections[name]??"'0"})`).join(',')});
      initial begin
        instructions={32'h0000a203,32'h002081b3}; #1;
        assert(dut.i_decode_rd[4:0]==3 && dut.i_decode_rd[9:5]==4) else $fatal(1,"Decoder register mapping");
        assert(dut.i_decode_rs[4:0]==1 && dut.i_decode_rs[9:5]==2) else $fatal(1,"Decoder source order");
        assert(dut.i_decode_memory==2'b10 && dut.i_decode_write==2'b11 && dut.i_decode_exception==0) else $fatal(1,"Load classification");
        assert(dut.U_SCHEDULER_CORE.i_decode_store==2'b10 && dut.U_SCHEDULER_CORE.i_decode_csr==2'b01 && dut.U_SCHEDULER_CORE.i_decode_end==2'b10) else $fatal(1,"Frontend classification lost");
        instructions[31:0]=32'h00000063; #1;
        assert(dut.i_decode_control[0]) else $fatal(1,"Branch classification");
        instructions[31:0]=32'hffffffff; #1;
        assert(dut.i_decode_exception[0] && dut.i_decode_cause[4:0]==2 && !dut.i_decode_memory[0]) else $fatal(1,"Illegal decode");
        fetch_fault=1;fetch_cause[4:0]=12; #1;
        assert(dut.i_decode_cause[4:0]==12) else $fatal(1,"Fetch fault priority");
        $display("ORYUKDO_DECODER_BRIDGE_PASS");$finish;
      end
    endmodule`;
    const paths=Object.entries({'top.sv':top,'bench.sv':bench,
      'decoder.sv':generateDecoderRTL(example.decoder,example.formats,example.instructions,oryBase.coresList),
      ...rtlSourcesFor('oryukdo')}).map(([name,data])=>{
      const filename=path.join(target,name);fs.writeFileSync(filename,data);return toolPath(filename);
    });
    const obj=path.join(target,'obj');
    runVerilator('ory_decoder_bridge_build',['--binary','--timing','--assert','-Wno-WIDTH','-Wno-fatal',
      '--unroll-count','256','-j','2','--Mdir',toolPath(obj),'--top-module','tb_ory_decoder_bridge',...paths]);
    const exe=toolPath(path.join(obj,'Vtb_ory_decoder_bridge'));
    const run=spawnSync(wsl?'wsl.exe':exe,wsl?['--exec',exe]:[],{encoding:'utf8'});
    fs.writeFileSync(path.join(reportDir,'ory_decoder_bridge.log'),`${run.stdout}${run.stderr}`);
    assert.equal(run.status,0,run.stdout+run.stderr);
    assert.ok(run.stdout.includes('ORYUKDO_DECODER_BRIDGE_PASS'));
    console.log('ory_decoder_bridge: ISA, classification, illegal instruction and fetch-fault priority passed');
  }

  // Execute upstream recovery/memory/CSR/wakeup tests through the GENERATED
  // external-decode wrapper, including both predictor modes. Only the module
  // name and paths to its nested core assertions differ from the upstream TB.
  const fixture = fs.readFileSync(path.join(appRoot,'scripts/fixtures/tb_oryukdo_scheduler.sv'),'utf8');
  for (const mode of [0,1]) {
    const target=path.join(dir,`ory_functional_${mode}`);fs.mkdirSync(target);
    const top=generateRTL({ ...oryBase, decoderSource:'external', predictorMode:mode?'external':'static' });
    const bench=fixture.replace('    oryukdo_scheduler #(', '    oryukdo_example_top #(').replaceAll('dut.', 'dut.U_SCHEDULER_CORE.');
    const paths=Object.entries({ 'top.sv':top, 'bench.sv':bench, ...rtlSourcesFor('oryukdo') }).map(([name,data])=>{
      const filename=path.join(target,name);fs.writeFileSync(filename,data);return toolPath(filename);
    });
    const obj=path.join(target,'obj');
    runVerilator(`ory_functional_${mode}_build`, ['--binary','--timing','--assert','-Wno-WIDTH','-Wno-fatal',
      '--unroll-count','256','-j','2','--Mdir',toolPath(obj),'--top-module','tb_oryukdo_scheduler',
      `-GEXTERNAL_PREDICTOR=${mode}`,...paths]);
    const exe=toolPath(path.join(obj,'Vtb_oryukdo_scheduler'));
    const run=spawnSync(wsl?'wsl.exe':exe,wsl?['--exec',exe]:[],{encoding:'utf8'});
    fs.writeFileSync(path.join(reportDir,`ory_functional_${mode}.log`),`${run.stdout}${run.stderr}`);
    assert.equal(run.status,0,run.stdout+run.stderr);
    assert.ok(run.stdout.includes('tb_oryukdo_scheduler PASS'));
    console.log(`ory_functional_${mode}: generated wrapper recovery/window/memory regression passed`);
  }

  console.log('Feature guards, parameter forwarding, source hashes and ZIP contents passed');
} finally {
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'youngdo-gen2-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
