import { useState, useRef, useEffect } from 'react';
import { Studio } from './components/Studio';
import { type Language, localizedError, tr } from './utils/locale';
import { type SchedulerConfig, generateRTL, validateSchedulerConfig } from './utils/rtlGenerator';
import {
  type DecoderParamConfig,
  type InstructionFormat,
  type InstructionConfig,
  immediateExpression,
  generateDecoderRTL,
} from './utils/decoderGenerator';
import { downloadSourceBundle } from './utils/sourceBundle';
import { validateFullConfig } from './utils/studioSettings';

function App() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem('youngdo-language') === 'en' ? 'en' : 'ko');
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('youngdo-language', language);
  }, [language]);
  const [projectName, setProjectName] = useState('my_project');

  const [config, setConfig] = useState<SchedulerConfig>({
    platform: 'eulsukdo',
    predictorMode: 'static',
    decoderSource: 'generated',
    decodeWidth: 2,
    phyRegs: 64,
    robEntries: 128,
    rsFifoEntries: 128,
    coresList: [
      { id: '1', name: 'Branch', count: 1, stroke: '#ff8052' },
      { id: '2', name: 'ALU', count: 3, stroke: '#48b4d5' },
      { id: '3', name: 'Memory', count: 1, stroke: '#ffcc00' }
    ],
    prmUpdate: 5,
    prmBuffer: 4,
    unallocatePhyreg: 4,
    flowWindows: 8,
    flowPcMaxRange: 16,
    enableMemoryOrder: false,
    memoryCoreId: '3',
  });

  const [decoderConfig, setDecoderConfig] = useState<DecoderParamConfig>({
    instBitWidth: 32,
    instRegs: 32,
    instOperands: 2,
    instImm: 32,
    microopBitWidth: 5,
    isaName: 'rv32i',
  });

  const [formatsList, setFormatsList] = useState<InstructionFormat[]>([
    {
      id: 'fmt-r',
      name: 'R_type',
      fields: [
        { id: 'f-r-1', name: 'opcode', msb: 6, lsb: 0, role: 'Condition' },
        { id: 'f-r-2', name: 'rd', msb: 11, lsb: 7, role: 'rd' },
        { id: 'f-r-3', name: 'funct3', msb: 14, lsb: 12, role: 'Condition' },
        { id: 'f-r-4', name: 'rs1', msb: 19, lsb: 15, role: 'rs1' },
        { id: 'f-r-5', name: 'rs2', msb: 24, lsb: 20, role: 'rs2' },
        { id: 'f-r-6', name: 'funct7', msb: 31, lsb: 25, role: 'Condition' },
      ],
    },
    {
      id: 'fmt-i',
      name: 'I_type',
      fields: [
        { id: 'f-i-1', name: 'opcode', msb: 6, lsb: 0, role: 'Condition' },
        { id: 'f-i-2', name: 'rd', msb: 11, lsb: 7, role: 'rd' },
        { id: 'f-i-3', name: 'funct3', msb: 14, lsb: 12, role: 'Condition' },
        { id: 'f-i-4', name: 'rs1', msb: 19, lsb: 15, role: 'rs1' },
        { id: 'f-i-5', name: 'imm', msb: 31, lsb: 20, role: 'imm' },
      ],
    },
  ]);

  const [instructions, setInstructions] = useState<InstructionConfig[]>([
    {
      id: 'inst-add',
      name: 'ADD',
      formatId: 'fmt-r',
      conditions: {
        opcode: "7'b0110011",
        funct7: "7'b0000000",
        funct3: "3'b000",
      },
      exPathId: '2', // ALU
      microop: 1,
      newregAlloc: true,
      jump: false,
      jumpReg: false,
      branch: false,
    },
    {
      id: 'inst-sub',
      name: 'SUB',
      formatId: 'fmt-r',
      conditions: {
        opcode: "7'b0110011",
        funct7: "7'b0100000",
        funct3: "3'b000",
      },
      exPathId: '2', // ALU
      microop: 2,
      newregAlloc: true,
      jump: false,
      jumpReg: false,
      branch: false,
    },
    {
      id: 'inst-lw',
      name: 'LW',
      formatId: 'fmt-i',
      conditions: {
        opcode: "7'b0000011",
        funct3: "3'b010",
      },
      exPathId: '3', // Memory
      microop: 3,
      newregAlloc: true,
      jump: false,
      jumpReg: false,
      branch: false,
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const settingsJson = JSON.stringify({
    projectName,
    scheduler: config,
    decoder: decoderConfig,
    formats: formatsList,
    instructions
  }, null, 2);

  // The standalone export and project ZIP contain the same importable settings.
  const handleExportJSON = () => {
    const blob = new Blob([settingsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eulsukdo_cad_config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Parses uploaded settings file and loads scheduler and decoder configs in parallel
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (validateFullConfig(parsed)) {
          const error = validateSchedulerConfig({ ...parsed.scheduler, ...parsed.decoder });
          if (error) {
            alert(localizedError(language, error));
            return;
          }
          setProjectName(parsed.projectName ?? 'my_project');
          setConfig({
            ...parsed.scheduler,
            platform: parsed.scheduler.platform ?? 'eulsukdo',
            predictorMode: parsed.scheduler.predictorMode ?? 'static',
            decoderSource: parsed.scheduler.decoderSource ?? 'generated',
            enableMemoryOrder: parsed.scheduler.enableMemoryOrder ?? false,
            memoryCoreId: parsed.scheduler.memoryCoreId ??
              parsed.scheduler.coresList.find(core => core.name.toLowerCase() === 'memory')?.id,
          });
          setDecoderConfig(parsed.decoder);
          setFormatsList(parsed.formats);
          setInstructions(parsed.instructions);
        } else {
          alert(tr(language, 'Invalid EULSUKDO CAD configuration format. Please verify the JSON file structure.'));
        }
      } catch {
        alert(tr(language, 'Failed to parse JSON file. Ensure it is a valid JSON document.'));
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input to allow duplicate selection
  };

  const rtlConfig = { ...config, ...decoderConfig };
  const configError = validateSchedulerConfig(rtlConfig);
  const invalidImmediate = config.decoderSource === 'external' ? undefined : formatsList.find((fmt) => fmt.immediateParts?.length &&
    !immediateExpression(fmt, decoderConfig.instImm, decoderConfig.instBitWidth));
  const downloadError = configError || (invalidImmediate
    ? `${invalidImmediate.name} 즉시값 비트 범위가 겹치거나 유효하지 않습니다.` : null) ||
    (!projectName.trim() ? 'ZIP을 생성하려면 프로젝트 이름을 입력하세요.' : null);
  const generatedCode = configError ? '' : generateRTL(rtlConfig);
  const generatedDecoderCode = config.decoderSource === 'external' || configError || invalidImmediate ? null :
    generateDecoderRTL(decoderConfig, formatsList, instructions, config.coresList);
  const handleDownloadProject = () => {
    if (downloadError) return;
    downloadSourceBundle(generatedCode, generatedDecoderCode, decoderConfig.isaName, projectName, settingsJson, config.platform);
  };

  return <Studio
    language={language} onLanguageChange={setLanguage}
    config={config} onConfigChange={setConfig}
    decoderConfig={decoderConfig} onDecoderChange={setDecoderConfig}
    formats={formatsList} onFormatsChange={setFormatsList}
    instructions={instructions} onInstructionsChange={setInstructions}
    projectName={projectName} onProjectNameChange={setProjectName}
    generatedCode={generatedCode} generatedDecoderCode={generatedDecoderCode} downloadError={downloadError}
    onDownloadProject={handleDownloadProject} onExportJSON={handleExportJSON}
    onImportJSON={handleImportJSON} fileInputRef={fileInputRef}
  />;
}

export default App;
