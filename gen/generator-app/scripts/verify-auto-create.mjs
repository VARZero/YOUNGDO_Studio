import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const appRoot = path.resolve(import.meta.dirname, '..');
const built = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: appRoot, env: { ...process.env, GITHUB_PAGES: 'true', GITHUB_REPOSITORY: 'VARZero/YOUNGDO_Studio' },
  encoding: 'utf8',
});
assert.equal(built.status, 0, built.stdout + built.stderr);
const prefix = '/YOUNGDO_Studio/';
const dist = path.join(appRoot, 'dist');
await fs.mkdir(path.join(appRoot, 'verification'), { recursive: true });
const server = http.createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('outside site');
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.resolve(dist, pathname.slice(prefix.length));
    if (!target.startsWith(dist + path.sep)) throw new Error('outside dist');
    const contents = await fs.readFile(target);
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(target)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const auto = `${base}auto_create/`;
const example = JSON.parse(await fs.readFile(path.join(appRoot, 'examples/rv32i_4decode_5issue.json'), 'utf8'));
const config = { ...example, projectName: '테스트 + & # 프로젝트' };
const smallConfig = { ...config, instructions: config.instructions.slice(0, 1),
  formats: config.formats.filter(format => format.id === config.instructions[0].formatId) };

function unzipStored(buffer) {
  const entries = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'Expected ZIP store encoding');
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    entries[name] = buffer.subarray(start, start + size).toString('utf8');
    offset = start + size;
  }
  return entries;
}

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function terminal(expected) {
    await page.locator('#auto-create-status[data-state="ready"], #auto-create-status[data-state="error"]').waitFor();
    assert.equal(await page.locator('#auto-create-status').getAttribute('data-state'), expected,
      await page.locator('#generation-error').textContent());
  }
  async function download(selector) {
    const waiting = page.waitForEvent('download');
    await page.locator(selector).click();
    const item = await waiting;
    assert.equal(await item.failure(), null);
    return { name: item.suggestedFilename(), data: await fs.readFile(await item.path()) };
  }
  await page.goto(auto);
  assert.equal(await page.locator('#auto-create-status').getAttribute('data-state'), 'idle');
  assert.ok((await page.locator('#agent-instructions').textContent()).includes('textContent'));
  const sample = await download('#download-example');
  assert.deepEqual(JSON.parse(sample.data.toString()), example);
  // Large configurations use fragments or the input form to avoid server URL limits.
  await page.goto(`${auto}?${new URLSearchParams({ config: JSON.stringify(smallConfig) })}`);
  await terminal('ready');
  await page.goto(`${auto}#${new URLSearchParams({ config: JSON.stringify(config) })}`);
  await terminal('ready');
  const manifest = JSON.parse(await page.locator('#generated-manifest').textContent());
  assert.equal(manifest.files.length, 13);
  const zip = await download('#download-zip');
  assert.equal(zip.name, manifest.archiveName);
  const entries = unzipStored(zip.data);
  assert.equal(Object.keys(entries).length, 14);
  assert.deepEqual(JSON.parse(Object.entries(entries).find(([key]) => key.endsWith('/youngdo_config.json'))[1]), config);
  for (const file of manifest.files) {
    assert.equal(Buffer.byteLength(entries[file.path], 'utf8'), file.bytes);
    await page.goto(file.url);
    await terminal('ready');
    assert.equal(await page.locator('#generated-file').textContent(), entries[file.path]);
    assert.equal(await page.locator('#generated-file').getAttribute('data-path'), file.path);
  }
  const textDownload = await download('#download-file');
  assert.equal(textDownload.data.toString('utf8'), entries[manifest.files.at(-1).path]);
  console.log('PASS: query JSON, Unicode/URL encoding, all 13 per-file pages, manifest and ZIP match');

  // Import the same settings through Studio and compare all RTL, including generated decoder/top.
  await page.goto(base);
  await page.locator('input[type="file"]').setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await page.getByRole('textbox', { name: /Project name|프로젝트 이름/ }).waitFor();
  await page.waitForFunction(value => document.querySelector('.studio-project input')?.value === value, config.projectName);
  const studioZip = await download('.studio-button-primary');
  const studioEntries = unzipStored(studioZip.data);
  for (const [name, contents] of Object.entries(entries)) {
    if (!name.endsWith('/youngdo_config.json')) assert.equal(studioEntries[name], contents, name);
  }
  console.log('PASS: automatic output matches Studio ZIP RTL byte-for-byte');

  // Enable LSQ through the actual Studio controls and round-trip the saved JSON
  // through auto-create. Check parameters and the exact upstream LSQ payload.
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable LSQ', exact: true }).check();
  await page.getByLabel('Memory EX path', { exact: true }).selectOption('3');
  await page.getByLabel('LSQ entries', { exact: true }).fill('1');
  assert.equal(await page.locator('.studio-header .studio-button-primary').isDisabled(), true);
  await page.getByLabel('LSQ entries', { exact: true }).fill('7');
  assert.equal(await page.locator('.studio-header .studio-button-primary').isEnabled(), true);
  const lsqZip = await download('.studio-header .studio-button-primary');
  const lsqEntries = unzipStored(lsqZip.data);
  const lsqSettings = JSON.parse(Object.entries(lsqEntries).find(([key]) => key.endsWith('/youngdo_config.json'))[1]);
  assert.equal(lsqSettings.scheduler.enableMemoryOrder, true);
  assert.equal(lsqSettings.scheduler.lsqEntries, 7);
  assert.equal(lsqSettings.scheduler.memoryCoreId, '3');
  const lsqTop = Object.entries(lsqEntries).find(([key]) => key.endsWith('_top.sv'))[1];
  assert.match(lsqTop, /parameter bit ENABLE_LSQ\s*=\s*1'b1,/);
  assert.match(lsqTop, /parameter int STRUCT_LSQ_ENTRIES\s*=\s*7,/);
  assert.match(lsqTop, /parameter int STRUCT_LSQ_EX_PATH\s*=\s*2,/);
  assert.ok(Object.keys(lsqEntries).some(key => key.endsWith('/load_store_queue.sv')));
  await page.screenshot({ path: path.join(appRoot, 'verification/studio-lsq-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(appRoot, 'verification/studio-lsq-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${auto}#${new URLSearchParams({ config: JSON.stringify(lsqSettings) })}`);
  await terminal('ready');
  assert.deepEqual(unzipStored((await download('#download-zip')).data), lsqEntries);
  await page.goto(base);
  await page.locator('input[type="file"]').setInputFiles({ name: 'lsq.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lsqSettings)) });
  await page.waitForFunction(() => document.querySelector('.studio-platform-options input[type="number"]')?.value === '7');
  assert.equal(await page.getByRole('checkbox', { name: /Enable LSQ|LSQ 켜기/, exact: true }).isChecked(), true);
  await page.getByRole('checkbox', { name: /Enable LSQ|LSQ 켜기/, exact: true }).uncheck();
  const offTop = Object.entries(unzipStored((await download('.studio-header .studio-button-primary')).data)).find(([key]) => key.endsWith('_top.sv'))[1];
  assert.match(offTop, /parameter bit ENABLE_LSQ\s*=\s*1'b0,/);
  console.log('PASS: Studio LSQ controls, depth guard, ON/OFF, JSON reload, mobile layout and auto-create ZIP round-trip');

  // Select ORYUKDO in the real UI, then verify the two predictor modes and
  // exact Studio/auto-create source identity, including the selected manifest.
  await page.locator('.studio-profile-list button').nth(1).click();
  assert.equal(await page.locator('.studio-profile-list button').nth(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel('IST SRAM banks', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('checkbox', { name:'Enable LSQ', exact:true }).count(), 0);
  assert.equal(await page.getByLabel('LSQ implementation', {exact:true}).inputValue(), 'builtin');
  assert.equal(await page.getByLabel('LSQ entries', { exact:true }).count(), 0);
  let oryEntries=unzipStored((await download('.studio-header .studio-button-primary')).data);
  let oryTop=Object.entries(oryEntries).find(([key])=>key.endsWith('_top.sv'))[1];
  assert.ok(oryTop.includes("EXTERNAL_PREDICTOR=1'b0"));
  assert.ok(oryTop.includes("CUSTOM_LSQ=1'b0"));
  assert.ok(!Object.keys(oryEntries).some(key=>key.includes('/custom_lsq/')));
  await page.getByLabel('LSQ implementation', {exact:true}).selectOption('custom');
  assert.equal(await page.getByLabel('LSQ implementation shortcut').inputValue(), 'custom');
  await page.getByLabel('LSQ implementation shortcut').selectOption('builtin');
  assert.equal(await page.getByLabel('LSQ implementation', {exact:true}).inputValue(), 'builtin');
  await page.getByLabel('LSQ implementation', {exact:true}).selectOption('custom');
  assert.ok(oryTop.includes('i_frontend_exception') && oryTop.includes('i_decode_store'));
  await page.getByRole('button', { name:/ORYUKDO integration/ }).click();
  await page.getByLabel('Branch predictor mode').selectOption('external');
  oryEntries=unzipStored((await download('.studio-header .studio-button-primary')).data);
  oryTop=Object.entries(oryEntries).find(([key])=>key.endsWith('_top.sv'))[1];
  assert.ok(oryTop.includes("EXTERNAL_PREDICTOR=1'b1"));
  assert.ok(oryTop.includes("CUSTOM_LSQ=1'b1"));
  const customLsq=Object.entries(oryEntries).find(([key])=>key.endsWith('/custom_lsq/oryukdo_custom_lsq.sv'));
  assert.ok(customLsq && customLsq[1].includes('module oryukdo_custom_lsq'));
  assert.ok(customLsq[1].includes('i_reserve') && customLsq[1].includes('o_allocate_ready'));
  assert.ok(customLsq[1].includes('U_REFERENCE'));
  assert.ok(Object.entries(oryEntries).find(([key])=>key.endsWith('/INTEGRATION.md'))[1].includes('CUSTOM_LSQ=1'));
  const orySettings=JSON.parse(Object.entries(oryEntries).find(([key])=>key.endsWith('/youngdo_config.json'))[1]);
  const oryVersion=JSON.parse(Object.entries(oryEntries).find(([key])=>key.endsWith('/SOURCE_VERSION.json'))[1]);
  assert.ok(oryVersion.repository.endsWith('/ORYUKDO.git'));
  assert.equal(Object.keys(oryVersion.sha256).length,17);
  assert.ok(Object.keys(oryEntries).some(key=>key.endsWith('/INTEGRATION.md')));
  await page.getByRole('button', { name:/Architecture/ }).click();
  assert.ok((await page.locator('.studio-export-summary').textContent()).includes('VARZero/ORYUKDO'));
  assert.ok((await page.locator('.studio-export-summary').textContent()).includes(oryVersion.commit.slice(0,12)));
  await page.screenshot({ path:path.join(appRoot,'verification/studio-oryukdo-desktop.png'), fullPage:true });
  await page.setViewportSize({ width:390,height:844 });
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({ path:path.join(appRoot,'verification/studio-oryukdo-mobile.png'),fullPage:true });
  await page.setViewportSize({ width:1440,height:1000 });
  await page.goto(`${auto}#${new URLSearchParams({ config:JSON.stringify(orySettings) })}`);
  await terminal('ready');
  const oryManifest=JSON.parse(await page.locator('#generated-manifest').textContent());
  assert.deepEqual(oryManifest.sourceVersion,oryVersion);
  assert.deepEqual(unzipStored((await download('#download-zip')).data),oryEntries);
  const selectedOryFile=oryManifest.files.find(file=>file.path.endsWith('/oryukdo_dependency_mapper.sv'));
  await page.goto(selectedOryFile.url);await terminal('ready');
  assert.equal(await page.locator('#generated-file').textContent(),oryEntries[selectedOryFile.path]);
  const customFile=oryManifest.files.find(file=>file.path.endsWith('/custom_lsq/oryukdo_custom_lsq.sv'));
  assert.ok(customFile);
  await page.goto(customFile.url);await terminal('ready');
  assert.equal(await page.locator('#generated-file').textContent(),customLsq[1]);
  const oryExternal={...orySettings,scheduler:{...orySettings.scheduler,decoderSource:'external'}};
  await page.goto(`${auto}#${new URLSearchParams({ config:JSON.stringify(oryExternal) })}`);
  await terminal('ready');
  const oryExternalEntries=unzipStored((await download('#download-zip')).data);
  assert.ok(!Object.keys(oryExternalEntries).some(key=>key.endsWith('_decoder.sv')));
  assert.match(Object.entries(oryExternalEntries).find(([key])=>key.endsWith('_top.sv'))[1],/input wire .*i_decode_memory/);
  console.log('PASS: ORYUKDO builtin/custom LSQ selection and template, fixed structure, both predictors, external decode, source manifest, individual file, ZIP round-trip and mobile layout');

  for (const [label, value] of [
    ['malformed JSON', '{oops'], ['wrong schema', '{}'],
    ['invalid parameter', JSON.stringify({ ...config, scheduler: { ...config.scheduler, istBanks: 3 } })],
    ['LSQ missing path', JSON.stringify({ ...config, scheduler: { ...config.scheduler, enableMemoryOrder: true } })],
    ['LSQ invalid depth', JSON.stringify({ ...config, scheduler: { ...config.scheduler, enableMemoryOrder: true, memoryCoreId: '3', lsqEntries: 1 } })],
    ['ORYUKDO fixed PRM capacity', JSON.stringify({ ...config, scheduler: { ...config.scheduler, platform: 'oryukdo', prmBuffer: 8 } })],
    ['ORYUKDO invalid LSQ mode', JSON.stringify({ ...orySettings, scheduler: { ...orySettings.scheduler, lsqMode: 'off' } })],
    ['ORYUKDO custom capacity in RTL', JSON.stringify({ ...orySettings, scheduler: { ...orySettings.scheduler, lsqEntries: 32 } })],
    ['null conditions', JSON.stringify({ ...config, instructions: [{ ...config.instructions[0], conditions: null }] })],
  ]) {
    await page.goto(`${auto}#${new URLSearchParams({ config: value })}`);
    await terminal('error');
    assert.equal(await page.locator('#generated-file').textContent(), '');
    assert.equal(await page.locator('#download-zip').getAttribute('href'), null);
    assert.ok(await page.locator('#generation-error').textContent(), label);
  }
  await page.goto(`${auto}?config={}#config={}`);
  await terminal('error');
  await page.goto(`${auto}file/?file=missing.sv#${new URLSearchParams({ config: JSON.stringify(config) })}`);
  await terminal('error');
  console.log('PASS: malformed/unsupported input and missing files expose error without stale results');

  await page.goto(auto);
  await page.locator('#config-input').fill(JSON.stringify(config));
  await page.locator('#generate').click();
  await terminal('ready');
  const external = { ...config, scheduler: { ...config.scheduler, decoderSource: 'external' } };
  await page.locator('#config-upload').setInputFiles({ name: 'external.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(external)) });
  await page.waitForFunction(() => {
    if (document.querySelector('#auto-create-status')?.getAttribute('data-state') !== 'ready') return false;
    return JSON.parse(document.querySelector('#generated-manifest').textContent).files.length === 12;
  });
  const externalManifest = JSON.parse(await page.locator('#generated-manifest').textContent());
  assert.ok(!externalManifest.files.some(file => file.path.endsWith('_decoder.sv')));
  await page.locator('#config-input').fill('{broken');
  await page.locator('#generate').click();
  await terminal('error');
  assert.equal(await page.locator('#generated-file').textContent(), '');
  console.log('PASS: pasted JSON, file upload, external decoder and repeated generation');

  await page.goto(auto);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(appRoot, 'verification/auto-create-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${auto}#${new URLSearchParams({ config: JSON.stringify(config) })}`);
  await terminal('ready');
  await page.screenshot({ path: path.join(appRoot, 'verification/auto-create-desktop.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: mobile layout and no browser JavaScript errors');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
