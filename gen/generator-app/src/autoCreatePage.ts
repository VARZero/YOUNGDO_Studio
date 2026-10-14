import './autoCreatePage.css';
import example from '../examples/rv32i_4decode_5issue.json';
import { generateProject, readAutoRequest } from './utils/autoCreate';
import { createZip } from './utils/sourceBundle';
import { sourceVersions } from './utils/rtlGenerator';

const workspace = document.querySelector<HTMLDivElement>('#auto-workspace')!;
// Only fixed markup goes through innerHTML. Configurations and generated RTL are textContent.
workspace.innerHTML = `
  <section>
    <div class="row"><h2>설정 JSON</h2><a id="download-example" download="youngdo_example.json">예제 JSON 다운로드</a></div>
    <form id="config-form">
      <label for="config-input">영도 스튜디오 JSON</label>
      <textarea id="config-input" spellcheck="false" placeholder="JSON을 붙여 넣거나 파일을 선택하세요."></textarea>
      <div class="row"><button id="generate" type="submit">프로젝트 생성</button><label>JSON 파일 선택 <input id="config-upload" type="file" accept=".json,application/json"></label></div>
    </form>
  </section>
  <section aria-live="polite">
    <p id="auto-create-status" data-state="idle">idle · JSON 입력 대기</p>
    <pre id="generation-error" hidden></pre>
  </section>
  <section id="generated-output" hidden>
    <div class="row"><h2>프로젝트 파일</h2><a id="download-zip">ZIP 다운로드</a></div>
    <ul id="generated-file-list"></ul>
    <details><summary>파일 목록 JSON · generated-manifest</summary><pre id="generated-manifest"></pre></details>
    <div class="row"><h2 id="generated-file-name"></h2><a id="download-file">이 파일 다운로드</a></div>
    <pre id="generated-file"></pre>
  </section>`;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const input = element<HTMLTextAreaElement>('config-input');
const status = element('auto-create-status');
const errorBox = element('generation-error');
const output = element('generated-output');
const encoder = new TextEncoder();
let outputUrls: string[] = [];
let generation = 0;

function blobUrl(contents: string | Uint8Array, type: string): string {
  const part = typeof contents === 'string' ? contents : new Uint8Array(contents).buffer;
  return URL.createObjectURL(new Blob([part], { type }));
}
const exampleLink = element<HTMLAnchorElement>('download-example');
exampleLink.href = blobUrl(JSON.stringify(example, null, 2), 'application/json');

function clearOutput() {
  output.hidden = true;
  errorBox.hidden = true;
  errorBox.textContent = '';
  for (const id of ['generated-manifest', 'generated-file', 'generated-file-name', 'generated-file-list']) element(id).textContent = '';
  delete element('generated-file').dataset.path;
  for (const id of ['download-zip', 'download-file']) element(id).removeAttribute('href');
  for (const url of outputUrls) URL.revokeObjectURL(url);
  outputUrls = [];
}

function fail(error: unknown) {
  clearOutput();
  errorBox.textContent = error instanceof Error ? error.message : String(error);
  errorBox.hidden = false;
  status.textContent = 'error · 생성 실패';
  status.dataset.state = 'error';
}

async function generate(configText: string, selectedFile: string | null) {
  const current = ++generation;
  clearOutput();
  status.textContent = 'working · 프로젝트 생성 중';
  status.dataset.state = 'working';
  // Yield once so automation can observe working before the synchronous generator runs.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (current !== generation) return;
  try {
    const config: unknown = JSON.parse(configText);
    const project = generateProject(config);
    const entries = Object.entries(project.files).filter(([path]) => !path.endsWith('/'));
    const selected = selectedFile ?? entries.find(([path]) => path.endsWith(`/RTL/${project.topName}`))![0];
    if (!entries.some(([path]) => path === selected)) throw new Error(`요청한 파일이 없습니다: ${selected}`);
    const fileEndpoint = new URL(`${import.meta.env.BASE_URL}auto_create/file/`, location.origin);
    const fragment = new URLSearchParams({ config: JSON.stringify(config) }).toString();
    const files = entries.map(([path, source]) => {
      const url = new URL(fileEndpoint);
      url.searchParams.set('file', path);
      url.hash = fragment;
      return { path, bytes: encoder.encode(source).length, url: url.href };
    });
    const manifest = {
      schemaVersion: 1, archiveName: project.archiveName, selectedFile: selected,
      sourceVersion: sourceVersions.eulsukdo,
      directories: Object.keys(project.files).filter(path => path.endsWith('/')),
      files,
    };
    const list = element('generated-file-list');
    for (const file of files) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = file.url;
      link.textContent = file.path;
      item.append(link);
      list.append(item);
    }
    element('generated-manifest').textContent = JSON.stringify(manifest, null, 2);
    element('generated-file').textContent = project.files[selected];
    element('generated-file').dataset.path = selected;
    element('generated-file-name').textContent = selected;
    const zipLink = element<HTMLAnchorElement>('download-zip');
    zipLink.href = blobUrl(createZip(project.files), 'application/zip');
    zipLink.download = project.archiveName;
    outputUrls.push(zipLink.href);
    const fileLink = element<HTMLAnchorElement>('download-file');
    fileLink.href = blobUrl(project.files[selected], 'text/plain;charset=utf-8');
    fileLink.download = selected.split('/').pop()!;
    outputUrls.push(fileLink.href);
    output.hidden = false;
    status.textContent = `ready · ${files.length}개 파일 생성 완료`;
    // Publish ready last: text, manifest and download links must all be available.
    status.dataset.state = 'ready';
  } catch (error) {
    fail(error);
  }
}

function loadAddress() {
  ++generation;
  try {
    const request = readAutoRequest(new URL(location.href));
    if (request.config !== null) {
      input.value = request.config;
      void generate(request.config, request.file);
    } else {
      clearOutput();
      input.value = '';
      status.textContent = 'idle · JSON 입력 대기';
      status.dataset.state = 'idle';
    }
  } catch (error) {
    fail(error);
  }
}
element<HTMLFormElement>('config-form').addEventListener('submit', event => {
  event.preventDefault();
  void generate(input.value, new URL(location.href).searchParams.get('file'));
});
element<HTMLInputElement>('config-upload').addEventListener('change', async event => {
  const upload = event.target as HTMLInputElement;
  const file = upload.files?.[0];
  if (!file) return;
  const current = ++generation;
  clearOutput();
  status.dataset.state = 'working';
  status.textContent = 'working · JSON 파일 읽는 중';
  try {
    const text = await file.text();
    if (current !== generation) return;
    input.value = text;
    await generate(text, new URL(location.href).searchParams.get('file'));
  } catch (error) {
    if (current === generation) fail(error);
  } finally {
    upload.value = '';
  }
});
window.addEventListener('hashchange', loadAddress);
// Browsers release remaining blob URLs on document unload; keep them for back/forward cache restores.
loadAddress();
