import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const utils = path.join(appRoot, 'src/utils');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oryukdo-generator-'));
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
      `const rtlSourcesFor = platform => (${JSON.stringify(platformSources.rtlSourceSets)})[platform];
const sourceVersions = ${JSON.stringify(platformSources.sourceVersions)};`,
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
  for (const [profile, extra] of [
    ['eulsukdo', { platform: 'eulsukdo', enableMemoryOrder: false, predictorMode: 'static' }],
    ['eulsukdo_lsq', { platform: 'eulsukdo', enableMemoryOrder: true, memoryCoreId: '3', predictorMode: 'static' }],
    ['oryukdo', { platform: 'oryukdo', enableMemoryOrder: true, memoryCoreId: '3', predictorMode: 'external' }],
    ['oryukdo_external_decoder', { platform: 'oryukdo', decoderSource: 'external', enableMemoryOrder: true, memoryCoreId: '3', predictorMode: 'static' }],
  ]) {
    const config = { ...example.scheduler, ...example.decoder, ...extra };
    const error = validateSchedulerConfig(config);
    if (error) throw new Error(`${profile}: ${error}`);
    const top = generateRTL(config);
    const decoder = generateDecoderRTL(example.decoder, example.formats, example.instructions, config.coresList);
    const isOryukdo = extra.platform === 'oryukdo';
    if (top.includes('ENABLE_RECOVERY_TRACKING') !== isOryukdo ||
        (isOryukdo && !/parameter bit ENABLE_RECOVERY_TRACKING\s*=\s*1'b1/.test(top)))
      throw new Error(`${profile}: wrong recovery setting`);
    const rtlSources = rtlSourcesFor(extra.platform);
    const expectedCount = isOryukdo ? 15 : 11;
    if (Object.keys(rtlSources).length !== expectedCount ||
        (rtlSources['retirement_frontier.sv'] !== undefined) !== isOryukdo)
      throw new Error(`${profile}: wrong source repository selected`);
    if (isOryukdo && /\$countones\s*\(/.test(rtlSources['eulsukdo_scheduler.sv']))
      throw new Error(`${profile}: ORYUKDO scheduler uses $countones, which Vivado 2020.2 cannot synthesize for variable masks`);
    if (sourceVersions[extra.platform].commit.length !== 40)
      throw new Error(`${profile}: missing source commit`);
    const archive = buildSourceBundle(top, null, config.isaName, 'sample', '{}', extra.platform);
    const zipText = new TextDecoder().decode(archive);
    if (!zipText.includes(sourceVersions[extra.platform].commit) ||
        !zipText.includes(`RTL/${extra.platform}_rtl/eulsukdo_scheduler.sv`) ||
        zipText.includes(`RTL/${isOryukdo ? 'eulsukdo' : 'oryukdo'}_rtl/eulsukdo_scheduler.sv`) ||
        projectArchiveName('sample', extra.platform) !== `sample_${extra.platform}_rtl.zip`)
      throw new Error(`${profile}: wrong RTL or source version in ZIP`);
    if (extra.decoderSource === 'external' &&
        (top.includes('GEN_DECODER') || !/input\s+wire\s+.*i_nel_decode_rd/.test(top)))
      throw new Error(`${profile}: external decode ports are not exposed`);
    const files = { 'generated_top.sv': top, 'generated_decoder.sv': decoder, ...rtlSources };
    const paths = Object.entries(files).map(([filename, data]) => {
      const output = path.join(dir, profile, filename);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      // Verilator 5.020 cannot lint this upstream BRAM initialization loop.
      // Change only the temporary lint copy; exported RTL remains byte-for-byte upstream.
      const lintData = process.env.VERILATOR_LEGACY_INIT === '1' && filename === '_element_logics.sv'
        ? data.replace('reg_mem[reg_init] <= INITIAL_VALUE;', 'reg_mem[reg_init] = INITIAL_VALUE;')
        : data;
      fs.writeFileSync(output, lintData);
      return output;
    });
    const result = spawnSync(process.env.VERILATOR_BIN ?? 'verilator',
      ['--lint-only', '-Wno-WIDTH', '--top-module', 'eulsukdo_example_top', ...paths],
      { encoding: 'utf8' });
    if (result.error) throw new Error(`${profile}: Verilator could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`${profile} generated top failed lint:\n${result.stdout}${result.stderr}`);
    console.log(`${profile}: generated top and ${Object.keys(rtlSources).length} RTL modules lint passed`);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
