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
const { buildSourceBundle, projectArchiveName, buildSourceFiles } = await loadUtility('sourceBundle.ts');
const example = JSON.parse(fs.readFileSync(path.join(appRoot, 'examples/rv32i_4decode_5issue.json'), 'utf8'));
try {
  const base = { ...example.scheduler, ...example.decoder, platform: 'eulsukdo', enableMemoryOrder: false };
  for (const extra of [{ platform: 'invalid' }, { enableMemoryOrder: true },
    { enableMemoryOrder: true, memoryCoreId: 'missing' },
    { enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 3 },
    { enableMemoryOrder: 'true' }, { lsqMode: 'custom' }, { lsqMode: 'off' }, { lsqEntries: 0 }, { lsqEntries: 2.5 }, { lsqEntries: null }, { lsqEntries: '32' },
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

  const oryBase = { ...base, platform: 'oryukdo', robEntries: 128, decodeWidth: 3,
    prmBuffer: 4, unallocatePhyreg: 4, enableMemoryOrder: true, memoryCoreId: '3' };
  for (const extra of [{ enableMemoryOrder: false }, { lsqMode: 'off' }, { lsqEntries: 2 },
    { istBanks: 2 }, { flowPcMaxRange: 2 }, { phyRegs: 33 }, { memoryCoreId: 'missing' },
    { asyncPortIsolation: 'false' }, { decodeWidth: 1, flowPcMaxRange: 1 }]) {
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
    assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stderr}`);
  }
  function writeSources(label, files) {
    const target = path.join(dir, label);
    fs.mkdirSync(target, {recursive:true});
    return Object.entries(files).filter(([name]) => name.endsWith('.sv')).map(([name, data]) => {
      const filename = path.join(target, name);fs.mkdirSync(path.dirname(filename), {recursive:true});
      fs.writeFileSync(filename,data);return toolPath(filename);
    });
  }
  for (const [profile, extra] of [
    ['ory_default_3d5i', {}],
    ['ory_custom_lsq', { lsqMode: 'custom' }],
    ['ory_custom_lsq_external', { lsqMode: 'custom', decoderSource: 'external', predictorMode: 'external' }],
    ['ory_predictor', { predictorMode: 'external' }],
    ['ory_external_decode', { decoderSource: 'external' }],
    ['ory_cpu_reset', { asyncPortIsolation: false }],
    ['ory_2d3i', { decodeWidth: 2, robEntries: 32, rsFifoEntries: 16, flowWindows: 5,
      lsqEntries: 7, coresList: base.coresList.map(core => ({ ...core, count: 1 })) }],
    ['ory_reordered_4d7i', { decodeWidth: 4, prmUpdate: 3, istIssueWidth: 4, istBanks: 8,
      prmBuffer: 8, unallocatePhyreg: 3,
      coresList: [base.coresList[1], { ...base.coresList[2], count: 3 }, { ...base.coresList[0], count: 1 }] }],
  ]) {
    const config = { ...oryBase, ...extra };
    assert.equal(validateSchedulerConfig(config), null, profile);
    const top = generateRTL(config);
    const decoder = config.decoderSource === 'external' ? null : generateDecoderRTL(example.decoder, example.formats, example.instructions, config.coresList);
    for (const [parameter,value] of Object.entries({
      STRUCT_DECODE_NEW_INST: config.decodeWidth, STRUCT_PHYREGS: config.phyRegs,
      STRUCT_INST_STATE_ENTRIES: config.robEntries, STRUCT_PRM_ENTRY_BUFFER: config.prmBuffer,
      STRUCT_UNALLOCATE_PHYREG: config.unallocatePhyreg, STRUCT_LSQ_ENTRIES: config.lsqEntries ?? 32,
      STRUCT_LSQ_EX_PATH: config.coresList.findIndex(core=>core.id===config.memoryCoreId),
    })) {
      assert.match(top,new RegExp(`parameter int ${parameter}\\s*=\\s*${value},`));
      assert.equal(top.split(`.${parameter}(${parameter})`).length-1,1);
    }
    assert.match(top,new RegExp(`USE_CUSTOM_BRANCH_PREDICTOR\\s*=\\s*1'b${config.predictorMode==='external'?1:0}`));
    assert.match(top,new RegExp(`ASYNC_PORT_ISOLATION\\s*=\\s*1'b${config.asyncPortIsolation===false?0:1}`));
    for (const name of ['i_sidefx_ready','i_sidefx_done','i_sidefx_error','o_trap_epc','o_trap_tval','o_backend_kill_inclusive'])
      assert.match(top,new RegExp(`\\.${name}\\s*\\(${name}\\)`),`Grouped port ${name} lost`);
    assert.equal(top.includes('GEN_DECODER'),config.decoderSource!=='external');
    assert.ok(!top.includes('i_decode_') && !top.includes('i_agu_'));
    const files=buildSourceFiles(top,decoder,config.isaName,'sample',JSON.stringify({scheduler:config}),'oryukdo');
    assert.equal(Object.keys(rtlSourcesFor('oryukdo')).length,20);
    for(const [name,data] of Object.entries(rtlSourcesFor('oryukdo')))
      assert.equal(files[`sample/RTL/oryukdo_rtl/${name}`],data);
    assert.equal(!!files['sample/RTL/custom_lsq/oryukdo_custom_lsq.sv'],config.lsqMode==='custom');
    const archive=buildSourceBundle(top,decoder,config.isaName,'sample',JSON.stringify({scheduler:config}),'oryukdo');
    fs.writeFileSync(path.join(reportDir,`${profile}.zip`),archive);
    const paths=writeSources(profile,files);
    runVerilator(profile,['--lint-only','--unroll-count','256','--top-module','oryukdo_example_top',...paths]);
    console.log(`${profile}: Gen3 ports, parameters, source hashes, ZIP and strict lint passed`);
  }

  function simulate(label, topName, files, buildArgs=[], runs=[[]]) {
    const paths=writeSources(label,files);
    const obj=path.join(dir,label,'obj');
    runVerilator(`${label}_build`,['--binary','--timing','--assert','--unroll-count','256','-j','4',
      '--Mdir',toolPath(obj),'--top-module',topName,...buildArgs,...paths]);
    for(let i=0;i<runs.length;i++) {
      const exe=toolPath(path.join(obj,`V${topName}`));
      const result=spawnSync(wsl?'wsl.exe':exe,wsl?['--exec',exe,...runs[i]]:runs[i],{encoding:'utf8',timeout:120000});
      fs.writeFileSync(path.join(reportDir,`${label}_${i}.log`),`${result.stdout}${result.stderr}`);
      assert.equal(result.status,0,`${label}: ${result.error??''}\n${result.stdout}${result.stderr}`);
      assert.match(result.stdout,/PASS/);
      console.log(`${label}: ${result.stdout.trim()}`);
    }
  }
  // Exercise the generated ISA bridge with actual instructions, including illegal decode.
  {
    const config={...oryBase,decodeWidth:2};
    const top=generateRTL(config);
    const ports=[...top.matchAll(/^\s*(input|output)\s+wire\s+(?:\[[^\]]+\]\s+)?(\w+(?:\s*,\s*\w+)*),?\s*$/gm)]
      .flatMap(([,direction,names])=>names.split(',').map(name=>({direction,name:name.trim()})));
    const bench=`module tb_decoder;
      logic [63:0] instructions=0;
      oryukdo_example_top dut(${ports.map(({direction,name})=>`.${name}(${direction==='output'?'':name==='i_im_recv_inst'?'instructions':"'0"})`).join(',')});
      initial begin
        instructions={32'h0000a203,32'h002081b3}; #1;
        assert(dut.i_nel_decode_rd[4:0]==3 && dut.i_nel_decode_rd[9:5]==4) else $fatal(1,"rd");
        assert(dut.i_nel_decode_rs[4:0]==1 && dut.i_nel_decode_rs[9:5]==2) else $fatal(1,"rs");
        assert(dut.i_nel_decode_newreg==2'b11 && dut.i_nel_decode_exception==0) else $fatal(1,"load");
        assert(dut.i_nel_decode_expath[3:2]==2) else $fatal(1,"memory path");
        instructions[31:0]=32'h00000063; #1;
        assert(dut.i_nel_decode_branch[0]) else $fatal(1,"branch");
        instructions[31:0]=32'hffffffff; #1;
        assert(dut.i_nel_decode_exception[0]) else $fatal(1,"illegal");
        $display("PASS generated Gen3 decoder");$finish;
      end
    endmodule`;
    simulate('ory_decoder','tb_decoder',{'top.sv':top,'bench.sv':bench,
      'decoder.sv':generateDecoderRTL(example.decoder,example.formats,example.instructions,config.coresList),
      ...rtlSourcesFor('oryukdo')});
  }
  // Run the upstream architectural scoreboard through the EXPORTED wrapper.
  // Only the top name and hierarchical DUT references are adapted.
  const fixture=fs.readFileSync(path.join(appRoot,'scripts/fixtures/tb_gen3.sv'),'utf8');
  for (const customLsq of [false,true]) for (const predictor of [false,true]) {
    const config={...oryBase,decoderSource:'external',lsqMode:customLsq?'custom':'builtin',predictorMode:predictor?'external':'static'};
    const files=buildSourceFiles(generateRTL(config),null,config.isaName,'sample',JSON.stringify({scheduler:config}),'oryukdo');
    let bench=fixture.replace('oryukdo_gen3_scheduler #(','oryukdo_example_top #(').replaceAll('dut.','dut.U_SCHEDULER_CORE.');
    if (customLsq) bench=bench.replaceAll('G_LSQ.U_LSQ.', 'G_LSQ.U_LSQ.U_REFERENCE.');
    const runs=customLsq||predictor ? [['+goal=2000']] : [
      ['+warm_reset','+goal=2000'],['+seed=91','+goal=5000'],['+seed=6101','+goal=5000'],
      ['+seed=70103','+goal=25000'],...[1,2,3,4].map(n=>[`+scenario=${n}`,'+goal=1000'])];
    simulate(`ory_functional_${Number(customLsq)}_${Number(predictor)}`,'tb_gen3',
      {...files,'bench.sv':bench},['-Wno-PINMISSING',`-GCUSTOM=1'b${Number(predictor)}`],runs);
  }
  for(const [name,sources] of [
    ['tb_branch_recovery',['oryukdo_branch_recovery.sv']],
    ['tb_protocols',['oryukdo_recovery_boundary.sv','oryukdo_sidefx_commit_bridge.sv']],
  ]) simulate(name,name,{
    'bench.sv':fs.readFileSync(path.join(appRoot,`scripts/fixtures/${name}.sv`),'utf8'),
    ...Object.fromEntries(sources.map(name=>[name,rtlSourcesFor('oryukdo')[name]])),
  });
  console.log('Feature guards, generated wrappers, source hashes, ZIP and Gen3 regressions passed');
} finally {
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'youngdo-gen2-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
