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
  assert.equal(manifest.files.length, 12);
  const zip = await download('#download-zip');
  assert.equal(zip.name, manifest.archiveName);
  const entries = unzipStored(zip.data);
  assert.equal(Object.keys(entries).length, 13);
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
  console.log('PASS: query JSON, Unicode/URL encoding, all 12 per-file pages, manifest and ZIP match');

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

  for (const [label, value] of [
    ['malformed JSON', '{oops'], ['wrong schema', '{}'],
    ['invalid parameter', JSON.stringify({ ...config, scheduler: { ...config.scheduler, istBanks: 3 } })],
    ['LSQ disabled', JSON.stringify({ ...config, scheduler: { ...config.scheduler, enableMemoryOrder: true } })],
    ['ORYUKDO disabled', JSON.stringify({ ...config, scheduler: { ...config.scheduler, platform: 'oryukdo' } })],
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
    return JSON.parse(document.querySelector('#generated-manifest').textContent).files.length === 11;
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
