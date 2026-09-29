import React, { useState } from 'react';
import { rtlSourcesFor, type SchedulerConfig } from '../utils/rtlGenerator';
import { type Language, tr } from '../utils/locale';

interface CodePreviewProps {
  language: Language;
  code: string;
  decoderCode: string | null;
  decoderFileName: string;
  platform: SchedulerConfig['platform'];
}

export const CodePreview: React.FC<CodePreviewProps> = ({ language, code, decoderCode, decoderFileName, platform }) => {
  const t = (value: string) => tr(language, value);
  const rtlSources = rtlSourcesFor(platform);
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState('eulsukdo_example_top.sv');
  const preview = fileName === 'eulsukdo_example_top.sv' ? code :
    fileName === '__decoder__' ? decoderCode ?? '' : rtlSources[fileName];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  return (
    <div className="panel code-panel">
      <div className="panel-header">
        <h2 className="panel-title">{t('Gen SystemVerilog')}</h2>
        <select aria-label={t('RTL file')} value={fileName} onChange={e => setFileName(e.target.value)}>
          <option value="eulsukdo_example_top.sv">{t('Generated wrapper')}</option>
          {decoderCode !== null && <option value="__decoder__">{decoderFileName} · {t('Generated decoder')}</option>}
          {Object.keys(rtlSources).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <div className="button-group">
          <button className="btn" onClick={handleCopy} disabled={!preview}>
            {copied ? t('Copied!') : t('Copy Code')}
          </button>
        </div>
      </div>
      <div className="code-container">
        <pre className="code-pre">
          {preview}
        </pre>
      </div>
    </div>
  );
};
