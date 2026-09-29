import { useState, type ChangeEvent, type RefObject } from 'react';
import { DecoderCustomizer } from './DecoderCustomizer';
import { CodePreview } from './CodePreview';
import { sourceVersions, type CoreTypeConfig, type SchedulerConfig } from '../utils/rtlGenerator';
import type { DecoderParamConfig, InstructionConfig, InstructionFormat } from '../utils/decoderGenerator';
import { type Language, localizedError, tr } from '../utils/locale';
import './Studio.css';
import './Youngdo.css';

type Section = 'architecture' | 'decoder' | 'execution' | 'recovery' | 'validate';

interface StudioProps {
  language: Language;
  onLanguageChange: (value: Language) => void;
  config: SchedulerConfig;
  onConfigChange: (value: SchedulerConfig) => void;
  decoderConfig: DecoderParamConfig;
  onDecoderChange: (value: DecoderParamConfig) => void;
  formats: InstructionFormat[];
  onFormatsChange: (value: InstructionFormat[]) => void;
  instructions: InstructionConfig[];
  onInstructionsChange: (value: InstructionConfig[]) => void;
  projectName: string;
  onProjectNameChange: (value: string) => void;
  generatedCode: string;
  generatedDecoderCode: string | null;
  downloadError: string | null;
  onDownloadProject: () => void;
  onExportJSON: () => void;
  onImportJSON: (event: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

const NAV: { key: Section; title: string }[] = [
  { key: 'architecture', title: 'Architecture' },
  { key: 'decoder', title: 'Decoder / ISA' },
  { key: 'execution', title: 'EX modules' },
  { key: 'recovery', title: 'ORYUKDO integration' },
  { key: 'validate', title: 'Validate & export' },
];
const COLORS = ['#ff8052', '#48b4d5', '#6bc6a1', '#a697df', '#e8ad6e', '#df729c'];

export function Studio(props: StudioProps) {
  const {
    language, onLanguageChange,
    config, onConfigChange, decoderConfig, onDecoderChange, formats, onFormatsChange,
    instructions, onInstructionsChange, projectName, onProjectNameChange, generatedCode, generatedDecoderCode,
    downloadError, onDownloadProject, onExportJSON, onImportJSON, fileInputRef,
  } = props;
  const [selectedSection, setSection] = useState<Section>('architecture');
  const [showSource, setShowSource] = useState(false);
  const [showReferenceEditor, setShowReferenceEditor] = useState(false);
  const isOryukdo = config.platform === 'oryukdo';
  const section = !isOryukdo && selectedSection === 'recovery' ? 'architecture' : selectedSection;
  const changePlatform = (platform: 'eulsukdo' | 'oryukdo') => {
    onConfigChange({ ...config, platform, predictorMode: platform === 'eulsukdo' ? 'static' : config.predictorMode ?? 'static' });
    setSection('architecture');
  };
  const coreCount = config.coresList.reduce((sum, core) => sum + core.count, 0);
  const memoryIndex = config.coresList.findIndex(core => core.id === config.memoryCoreId);
  const memoryLane = memoryIndex < 0 ? -1 : config.coresList.slice(0, memoryIndex).reduce((sum, core) => sum + core.count, 0);
  const checks = [
    { title: 'Issue / WBC lane totals', ok: coreCount > 0 && config.coresList.every(core => core.count > 0) },
    { title: 'Memory lane reserved', ok: !config.enableMemoryOrder || (memoryIndex >= 0 && config.coresList[memoryIndex].count === 1) },
    ...(isOryukdo ? [{ title: 'Predictor fallback present', ok: true }] : []),
  ];
  const patch = (update: Partial<SchedulerConfig>) => onConfigChange({ ...config, ...update });
  const numberField = (key: 'decodeWidth' | 'phyRegs' | 'robEntries', value: number) =>
    patch({ [key]: Number.isFinite(value) ? value : 0 });
  const stepDecode = (delta: number) => numberField('decodeWidth', Math.max(1, Math.min(8, config.decodeWidth + delta)));
  const updateCore = (id: string, update: Partial<CoreTypeConfig>) =>
    patch({ coresList: config.coresList.map(core => core.id === id ? { ...core, ...update } : core) });
  const moveCore = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= config.coresList.length) return;
    const list = [...config.coresList];
    [list[index], list[target]] = [list[target], list[index]];
    patch({ coresList: list });
  };
  const addCore = () => patch({ coresList: [...config.coresList, {
    id: `core-${Date.now()}`, name: `EX_PATH_${config.coresList.length + 1}`,
    count: 1, stroke: COLORS[config.coresList.length % COLORS.length],
  }] });
  const removeCore = (id: string) => {
    if (config.coresList.length <= 2) return;
    patch({ coresList: config.coresList.filter(core => core.id !== id) });
  };
  const openValidation = () => { setShowSource(false); setSection('validate'); };
  const t = (value: string) => tr(language, value);
  const displayError = localizedError(language, downloadError);
  const externalDecode = config.decoderSource === 'external';
  const decodeSignals = [
    ['rd', `D × ${Math.ceil(Math.log2(decoderConfig.instRegs))}`, 'Destination register'],
    ['rs', `D × ${decoderConfig.instOperands} × ${Math.ceil(Math.log2(decoderConfig.instRegs))}`, 'Source registers'],
    ['imm', `D × ${decoderConfig.instImm}`, 'Immediate value'],
    ['microop', `D × ${decoderConfig.microopBitWidth}`, 'Micro operation'],
    ['expath', `D × ${Math.max(1, Math.ceil(Math.log2(config.coresList.length)))}`, 'EX path index'],
    ['exception', 'D', 'Decode exception'],
    ['newreg', 'D', 'Destination allocation'],
    ['jump', 'D', 'Jump flag'],
    ['jump_reg', 'D', 'Register jump flag'],
    ['branch', 'D', 'Branch flag'],
    ...(isOryukdo ? [['exception_cause', 'D × 5', 'Exception cause input']] : []),
  ];

  return <div className="studio-app">
    <header className="studio-header">
      <div className="studio-brand"><span className="studio-brand-mark" /> <strong>YOUNGDO Studio</strong><span className="studio-brand-badge">{t('Processor structure generator')}</span></div>
      <div className="studio-header-actions">
        <div className="studio-language" role="group" aria-label={t('Language')}>
          <button lang="ko" aria-pressed={language === 'ko'} className={language === 'ko' ? 'selected' : ''} onClick={() => onLanguageChange('ko')}>한국어</button>
          <button lang="en" aria-pressed={language === 'en'} className={language === 'en' ? 'selected' : ''} onClick={() => onLanguageChange('en')}>English</button>
        </div>
        <label className="studio-project">{t('Project')} <input aria-label={t('Project name')} value={projectName} maxLength={64} onChange={e => onProjectNameChange(e.target.value)} /></label>
        <button className="studio-button" onClick={onExportJSON}>{t('Export JSON')}</button>
        <button className="studio-button" onClick={() => fileInputRef.current?.click()}>{t('Import JSON')}</button>
        <button className="studio-button studio-button-primary" onClick={onDownloadProject} disabled={!!downloadError}>{t('Generate ZIP')} <span aria-hidden="true">→</span></button>
        <input ref={fileInputRef} type="file" accept=".json" hidden onChange={onImportJSON} />
      </div>
    </header>
    <div className="studio-layout">
      <aside className="studio-sidebar">
        <div className="studio-eyebrow">01 / {t('Choose platform')}</div>
        <div className="studio-profile-list">
          <button aria-pressed={!isOryukdo} className={!isOryukdo ? 'selected' : ''} onClick={() => changePlatform('eulsukdo')}>
            <span className="studio-radio" /><span><strong>EULSUKDO</strong><small>{t('Application OoO engine')}</small></span>
          </button>
          <button aria-pressed={isOryukdo} className={isOryukdo ? 'selected' : ''} onClick={() => changePlatform('oryukdo')}>
            <span className="studio-radio" /><span><strong>ORYUKDO</strong><small>{t('CPU extension')}</small></span>
          </button>
        </div>
        <div className="studio-separator" />
        <div className="studio-eyebrow">{t('Workspace')}</div>
        <nav aria-label={t('Generator sections')} className="studio-nav">{NAV.filter(item => item.key !== 'recovery' || isOryukdo).map((item, index) =>
          <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>
            <span>{String(index + 1).padStart(2, '0')}</span>{t(item.title)}
          </button>)}</nav>
        <div className="studio-separator" />
        <div className="studio-eyebrow studio-shape-title">{t('Core shape')}</div>
        <div className="studio-setting"><span>{t('Decode width')}</span><div className="studio-stepper"><button aria-label={t('Decrease decode width')} onClick={() => stepDecode(-1)}>−</button><input aria-label={t('Decode width')} type="number" min="1" max="8" value={config.decodeWidth} onChange={e => numberField('decodeWidth', Number(e.target.value))} /><button aria-label={t('Increase decode width')} onClick={() => stepDecode(1)}>+</button></div></div>
        <div className="studio-setting"><span>{t('EX issue ports')}</span><strong>{coreCount}</strong></div>
        <div className="studio-setting"><span>{t('IST / frontier entries')}</span><input className="studio-small-number" aria-label={t('IST and frontier entries')} type="number" min="2" value={config.robEntries} onChange={e => numberField('robEntries', Number(e.target.value))} /></div>
        <div className="studio-setting"><span>{t('Physical registers')}</span><input className="studio-small-number" aria-label={t('Physical registers')} type="number" min="1" value={config.phyRegs} onChange={e => numberField('phyRegs', Number(e.target.value))} /></div>
        <div className="studio-separator" />
        <label className="studio-setting studio-switch-row"><span>{t('Memory ordering')}</span><input type="checkbox" checked={!!config.enableMemoryOrder} onChange={e => patch({ enableMemoryOrder: e.target.checked })} /><span className="studio-switch" /></label>
        <div className="studio-setting"><span>{t('Precise recovery')}</span><strong className={isOryukdo ? 'studio-green' : 'studio-muted'}>{isOryukdo ? t('ON') : t('OFF')}</strong></div>
        <div className="studio-profile-check"><strong>{t('PROFILE CHECK')}</strong><span>{displayError ?? t('Ports and widths consistent')}</span></div>
      </aside>

      <div className="studio-workspace">
        {section === 'decoder' ? <div className="studio-decoder-page">
          <div className="studio-page-heading"><div><span className="studio-eyebrow">02 / {t('Decoder / ISA')}</span><h1>{t('Instruction source')}</h1><p>{t('Generate a decoder from your ISA settings or connect decoded signals from your own module.')}</p></div></div>
          <div className="studio-decoder-sources" role="group" aria-label={t('Instruction input mode')}>
            <button className={!externalDecode ? 'selected' : ''} aria-pressed={!externalDecode} onClick={() => patch({ decoderSource: 'generated' })}>
              <span className="studio-source-icon">01</span><span><strong>{t('Generate ISA decoder')}</strong><small>{t('Instruction bits → generated decoder → scheduler')}</small></span><span className="studio-source-radio" />
            </button>
            <button className={externalDecode ? 'selected' : ''} aria-pressed={externalDecode} onClick={() => patch({ decoderSource: 'external' })}>
              <span className="studio-source-icon">02</span><span><strong>{t('Connect external decoder')}</strong><small>{t('Custom decoder or predecoded source → scheduler ports')}</small></span><span className="studio-source-radio" />
            </button>
          </div>
          <div className="studio-decoder-overview">
            <div><span className="studio-eyebrow">{t('Input lanes')}</span><strong>{config.decodeWidth}</strong><small>{t('Decoded bundles per cycle')}</small></div>
            <div><span className="studio-eyebrow">{t('ISA width')}</span><strong>{decoderConfig.instBitWidth} {t('bits')}</strong><small>{decoderConfig.isaName}</small></div>
            <div><span className="studio-eyebrow">{t('EX paths')}</span><strong>{config.coresList.length}</strong><small>{config.coresList.map(core => core.name).join(' · ')}</small></div>
          </div>
          {externalDecode ? <div className="studio-decode-signals">
            <div className="studio-section-heading"><div><span className="studio-eyebrow">{t('External interface')}</span><h2>{t('External decode signals')}</h2></div><button className="studio-text-button" onClick={() => setShowReferenceEditor(value => !value)}>{showReferenceEditor ? t('Hide ISA reference') : t('Open ISA reference editor')} →</button></div>
            <p>{t('The exported top exposes these i_nel_decode_* buses directly. Supply all lanes from your decoder, predecoder or custom instruction source. The optional ISA reference editor does not affect this mode or add a decoder to the ZIP.')}</p>
            <div className="studio-table-wrap"><table><thead><tr><th>{t('Port')}</th><th>{t('Width')}</th><th>{t('Meaning')}</th></tr></thead><tbody>{decodeSignals.map(([port, width, meaning]) => <tr key={port}><td><code>i_nel_decode_{port}</code></td><td>{width}</td><td>{t(meaning)}</td></tr>)}</tbody></table></div>
            <div className="studio-note">{isOryukdo ? t('ORYUKDO takes decode exception cause from an external input. Instruction memory handshake and PC remain top-level connections.') : t('Instruction memory handshake and PC remain top-level connections.')}</div>
          </div> : <div className="studio-decoder-editor-heading"><span className="studio-eyebrow">{t('ISA editor')}</span><h2>{t('Formats and instructions')}</h2><p>{t('Edit fields and EX mappings below. The decoder is instantiated once per input lane in the exported top.')}</p><button className="studio-text-button" onClick={() => { setShowSource(true); setSection('validate'); }}>{t('View generated RTL in Validate & export')} →</button></div>}
          {(!externalDecode || showReferenceEditor) && <DecoderCustomizer language={language} decConfig={decoderConfig} onChangeDecConfig={onDecoderChange} formats={formats} onChangeFormats={onFormatsChange} instructions={instructions} onChangeInstructions={onInstructionsChange} coresList={config.coresList} />}
        </div> : <div className="studio-main-grid">
          <main className="studio-center">
            {section === 'architecture' && <>
              <div className="studio-hero"><div><span className="studio-eyebrow">01 / {t('Choose platform')}</span><h1>{t('Processor configuration')}</h1><p>{t('Select a base platform, then set ISA, EX paths and optional memory ordering.')}</p></div><span className="studio-hero-badge">{isOryukdo ? 'ORYUKDO' : 'EULSUKDO'}</span></div>
              <div className="studio-platform-grid" role="group" aria-label={t('Choose platform')}>
                <button aria-pressed={!isOryukdo} className={!isOryukdo ? 'selected' : ''} onClick={() => changePlatform('eulsukdo')}><span>01 / EULSUKDO</span><strong>{t('Application OoO platform')}</strong><small>{t('Shared ISA and EX configuration. LSQ optional.')}</small></button>
                <button aria-pressed={isOryukdo} className={isOryukdo ? 'selected' : ''} onClick={() => changePlatform('oryukdo')}><span>02 / ORYUKDO</span><strong>{t('CPU platform extension')}</strong><small>{t('Recovery and predictor included. LSQ optional; CSR supplied by user.')}</small></button>
              </div>
              <div className="studio-platform-options"><div><span className="studio-eyebrow">{t('Memory ordering')}</span><strong>{t('Load / store queue')}</strong><small>{t('Available on both platforms')}</small></div><label className="studio-check"><input type="checkbox" checked={!!config.enableMemoryOrder} onChange={e => patch({ enableMemoryOrder: e.target.checked })} /> {t('Enable LSQ')}</label>{config.enableMemoryOrder && <label className="studio-select-label">{t('Memory EX path')}<select value={config.memoryCoreId ?? ''} onChange={e => patch({ memoryCoreId: e.target.value })}><option value="">{t('Select a path')}</option>{config.coresList.map(c => <option value={c.id} key={c.id}>{c.name} ({c.count})</option>)}</select></label>}</div>
              <div className="studio-section-heading"><span className="studio-eyebrow">{t('Live structure')}</span><small>{config.decodeWidth}D / {coreCount}I / {config.robEntries} {t('entries')}</small></div>
              <div className="studio-pipeline">
                <div className="studio-stages">
                  <div className="studio-stage fetch"><small>01 {t('FETCH')}</small><strong>{isOryukdo ? t('FCL + predictor') : 'FCL'}</strong><span>{isOryukdo ? config.predictorMode === 'external' ? t('external / fallback') : t('static not taken') : t('flow windows')}</span></div>
                  <div className="studio-stage decode"><small>02 {t('DECODE')}</small><strong>{t('ISA lanes')} ×{config.decodeWidth}</strong><span>{t('uop / exception')}</span></div>
                  <div className="studio-stage rename"><small>03 {t('RENAME')}</small><strong>NEL + PRM</strong><span>{isOryukdo ? t('spec / committed') : t('physical mapping')}</span></div>
                  <div className="studio-stage schedule"><small>04 {t('SCHEDULE')}</small><strong>IST + RS</strong><span>{isOryukdo ? t('age tagged issue') : t('ready list issue')}</span></div>
                  <div className="studio-stage execute"><small>05 {t('EXECUTE')}</small><strong>{t('External EX')} ×{coreCount}</strong><span>{config.coresList.map(c => `${c.name} ×${c.count}`).join(' · ')}</span></div>
                </div>
                <div className="studio-return-path"><div className="studio-stage memory"><small>{t('MEMORY ORDER')}</small><strong>{config.enableMemoryOrder ? isOryukdo ? t('LSQ + store gate') : 'LSQ' : t('Optional LSQ')}</strong></div><div className="studio-stage frontier"><small>{isOryukdo ? t('ORDERED COMMIT') : t('Flow completion')}</small><strong>{isOryukdo ? t('Retirement frontier') : 'FCL'}</strong></div><div className="studio-stage wbc"><small>{t('RESULT ACCEPTANCE')}</small><strong>WBC · {isOryukdo ? t('key + age') : t('flow + PC')}</strong></div></div>
                <div className="studio-recovery-line">↶ {isOryukdo ? t('mispredict / exception → flush + redirect') : t('completion and register reuse')}</div>
              </div>
              <div className="studio-section-heading"><span className="studio-eyebrow">{t('Execution map')}</span><button className="studio-text-button" onClick={() => setSection('execution')}>{t('Edit paths →')}</button></div>
              <div className="studio-table-wrap"><table><thead><tr><th>{t('Path')}</th><th>{t('Issue')}</th><th>WBC</th><th>{t('Recovery behavior')}</th></tr></thead><tbody>{config.coresList.map((core, index) => { const first = config.coresList.slice(0, index).reduce((sum, c) => sum + c.count, 0); const memory = config.enableMemoryOrder && core.id === config.memoryCoreId; return <tr key={core.id}><td><i style={{ background: core.stroke }} />{core.name}</td><td>{core.count}</td><td>{core.count === 1 ? first : `${first}–${first + core.count - 1}`}</td><td>{memory ? isOryukdo ? t('AGU → LSQ → gated commit') : t('AGU → LSQ') : isOryukdo ? t('tagged result + flush') : t('flow completion')}</td></tr>; })}</tbody></table></div>
              <div className="studio-export-summary"><span className="studio-eyebrow">{t('Files to export')}</span><strong>top.sv &nbsp; {!externalDecode && 'decoder.sv　'} RTL/</strong><small>{t('The ZIP contains the selected top and RTL sources. EX is supplied by your project; ORYUKDO CSR is external.')}</small><small>{isOryukdo ? 'VARZero/ORYUKDO' : 'VARZero/EULSUKDO_LSQ'} · {sourceVersions[isOryukdo ? 'oryukdo' : 'eulsukdo'].commit.slice(0, 12)}</small></div>
            </>}
            {section === 'execution' && <>
              <div className="studio-page-heading"><span className="studio-eyebrow">03 / {t('EX modules')}</span><h1>{t('Execution paths')}</h1><p>{t('Each path has a decoder mapping and a fixed group of issue and WBC lanes. EX logic remains replaceable RTL.')}</p></div>
              <div className="studio-path-list">{config.coresList.map((core, index) => { const first = config.coresList.slice(0, index).reduce((sum, c) => sum + c.count, 0); return <div className="studio-path-card" key={core.id} style={{ borderLeftColor: core.stroke }}><div className="studio-path-top"><span>{t('PATH')} {String(index).padStart(2, '0')}</span><div><button onClick={() => moveCore(index, -1)} disabled={index === 0} aria-label={`${core.name} ${t('Move up')}`}>↑</button><button onClick={() => moveCore(index, 1)} disabled={index === config.coresList.length - 1} aria-label={`${core.name} ${t('Move down')}`}>↓</button><button onClick={() => removeCore(core.id)} disabled={config.coresList.length <= 2} aria-label={`${core.name} ${t('Remove')}`}>×</button></div></div><label>{t('Name')}<input value={core.name} onChange={e => updateCore(core.id, { name: e.target.value })} /></label><label>{t('Issue and WBC lanes')}<input type="number" min="1" max="8" value={core.count} onChange={e => updateCore(core.id, { count: Number(e.target.value) })} /></label><small>WBC {core.count === 1 ? first : `${first}–${first + core.count - 1}`} · {isOryukdo ? t('EX provides result key, age and flush handling.') : t('Connect the EX result and completion ports.')}</small></div>; })}</div>
              <button className="studio-button studio-add" onClick={addCore}>{t('+ Add EX path')}</button>
              <div className="studio-note">{t('The generator assigns lane ranges in path order. A selected LSQ path must contain one issue port and reserves its WBC lane.')}</div>
            </>}
            {section === 'recovery' && <>
              <div className="studio-page-heading"><span className="studio-eyebrow">04 / ORYUKDO</span><h1>{t('CPU integration')}</h1><p>{t('Recovery and the predictor interface are included. Supply the CSR and trap controller in your project.')}</p></div>
              <div className="studio-form-card"><div><span className="studio-eyebrow">{t('Recovery mode')}</span><h2>{t('ORYUKDO recovery enabled')}</h2><p>{t('Age-tagged results, committed rename map, younger flush and ordered exceptions.')}</p></div><strong>{t('Included')}</strong></div>
              <div className="studio-form-card"><div><span className="studio-eyebrow">{t('Prediction module')}</span><h2>{t('Branch predictor')}</h2><p>{t('Static not taken remains the fallback when the external response is absent.')}</p></div><select aria-label={t('Branch predictor mode')} value={isOryukdo ? config.predictorMode ?? 'static' : 'static'} disabled={!isOryukdo} onChange={e => patch({ predictorMode: e.target.value as 'static' | 'external' })}><option value="static">{t('Static not taken')}</option><option value="external">{t('External interface')}</option></select></div>
              <div className="studio-form-card"><div><span className="studio-eyebrow">{t('User module')}</span><h2>{t('CSR / trap control')}</h2><p>{t('No CSR register file or CSR instruction unit is generated. Connect your interrupt policy, trap vector, EPC storage and return logic to the exported ports.')}</p></div><span className="studio-status-warning">{t('User supplied RTL')}</span></div>
            </>}
            {section === 'validate' && <>
              <div className="studio-page-heading"><span className="studio-eyebrow">{isOryukdo ? '05' : '04'} / {t('Validate & export')}</span><h1>{t('Review and export')}</h1><p>{t('Check the settings and generated RTL, then download the source ZIP.')}</p></div>
              <div className="studio-validation-grid"><div className="studio-metric"><span>{t('Platform')}</span><strong>{isOryukdo ? 'ORYUKDO' : 'EULSUKDO'}</strong></div><div className="studio-metric"><span>{t('Decoder / EX')}</span><strong>{config.decodeWidth} / {coreCount}</strong></div><div className="studio-metric"><span>{t('IST / frontier')}</span><strong>{config.robEntries}</strong></div><div className="studio-metric"><span>LSQ</span><strong>{config.enableMemoryOrder ? `WBC ${memoryLane}` : t('OFF')}</strong></div></div>
              {displayError && <div className="studio-error" role="alert">{displayError}</div>}
              <div className="studio-validation-actions"><button className="studio-button" onClick={() => setShowSource(!showSource)}>{showSource ? t('Hide source') : t('Inspect generated RTL')}</button><button className="studio-button studio-button-primary" onClick={onDownloadProject} disabled={!!downloadError}>{t('Generate ZIP')} →</button></div>
              {showSource && <div className="studio-preview"><CodePreview key={isOryukdo ? 'oryukdo' : 'eulsukdo'} platform={config.platform} language={language} code={generatedCode} decoderCode={generatedDecoderCode} decoderFileName={`${decoderConfig.isaName}_decoder.sv`} /></div>}
              <div className="studio-note">{t('The editor checks configuration rules. Your project supplies EX, instruction and data memory, and ORYUKDO CSR logic. Lint the exported top during integration.')}</div>
            </>}
          </main>
          <aside className="studio-details">
            <span className="studio-eyebrow">{t('External modules')}</span>
            {isOryukdo && <button className="studio-socket" onClick={() => setSection('recovery')}><span className="studio-dot mint" /><strong>{t('Branch predictor')}</strong><small>{config.predictorMode === 'external' ? t('External interface + fallback') : t('Static not taken')}</small><em>{t('request / decision / update')}</em></button>}
            <button className="studio-socket" onClick={() => setSection('execution')}><span className="studio-dot orange" /><strong>{t('EX implementations')}</strong><small>{t('External RTL slots')} ×{coreCount}</small><em>{isOryukdo ? t('key / age / accept / flush') : t('result / completion')}</em></button>
            {isOryukdo && <button className="studio-socket" onClick={() => setSection('recovery')}><span className="studio-dot violet" /><strong>{t('CSR / trap control')}</strong><small>{t('User supplied RTL')}</small><em>{t('fault / interrupt / vector / EPC')}</em></button>}
            <span className="studio-eyebrow studio-details-heading">{t('Connection checks')}</span>
            <div className="studio-checks">{checks.map(check => <div key={check.title}><span className={check.ok ? 'pass' : 'fail'}>{check.ok ? '✓' : '!'}</span>{t(check.title)}</div>)}{isOryukdo && <div><span className="pending">·</span>{t('CSR is supplied by your project')}</div>}<small>{displayError ?? t('Settings look valid · connect external modules during integration')}</small></div>
            <button className="studio-export-card" onClick={openValidation}><span className="studio-eyebrow">{t('Export')}</span><strong>{t('Configuration JSON')}</strong><strong>{t('Top and interface ports')}</strong><small>{t('Review files →')}</small></button>
          </aside>
        </div>}
      </div>
    </div>
  </div>;
}
