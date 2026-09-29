import { useState, useRef, useEffect } from 'react';
import { Studio } from './components/Studio';
import { type Language, tr } from './utils/locale';
import { type SchedulerConfig, generateRTL, validateSchedulerConfig } from './utils/rtlGenerator';
import {
  type DecoderParamConfig,
  type InstructionFormat,
  type InstructionConfig,
  immediateExpression,
  generateDecoderRTL,
} from './utils/decoderGenerator';
import { downloadSourceBundle } from './utils/sourceBundle';

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
    decodeWidth: 4,
    phyRegs: 64,
    robEntries: 64,
    coresList: [
      { id: '2', name: 'ALU', count: 3, stroke: '#48b4d5' },
      { id: '1', name: 'Branch', count: 1, stroke: '#ff8052' },
      { id: '3', name: 'Memory', count: 1, stroke: '#ffcc00' }
    ],
    prmUpdate: 3,
    prmBuffer: 4,
    unallocatePhyreg: 4,
    flowWindows: 8,
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

  // Validation function for the entire global CAD configuration schema
  const validateFullConfig = (data: unknown): data is {
    projectName?: string;
    scheduler: SchedulerConfig;
    decoder: DecoderParamConfig;
    formats: InstructionFormat[];
    instructions: InstructionConfig[];
  } => {
    const parsed = data as {
      projectName?: string;
      scheduler: SchedulerConfig;
      decoder: DecoderParamConfig;
      formats: InstructionFormat[];
      instructions: InstructionConfig[];
    };
    if (!data || typeof data !== 'object') return false;
    if (parsed.projectName !== undefined && typeof parsed.projectName !== 'string') return false;

    // 1. Scheduler Validation
    if (!parsed.scheduler || typeof parsed.scheduler !== 'object') return false;
    const schedParams = [
      'decodeWidth',
      'phyRegs',
      'robEntries',
      'coresList',
      'prmUpdate',
      'prmBuffer',
      'unallocatePhyreg',
      'flowWindows'
    ];
    for (const p of schedParams) {
      if (!(p in parsed.scheduler)) return false;
      if (p !== 'coresList' && typeof (parsed.scheduler as unknown as Record<string, unknown>)[p] !== 'number') return false;
    }
    if (!Array.isArray(parsed.scheduler.coresList)) return false;
    if (parsed.scheduler.enableMemoryOrder !== undefined && typeof parsed.scheduler.enableMemoryOrder !== 'boolean') return false;
    if (parsed.scheduler.platform !== undefined && !['eulsukdo', 'oryukdo'].includes(parsed.scheduler.platform)) return false;
    if (parsed.scheduler.predictorMode !== undefined && !['static', 'external'].includes(parsed.scheduler.predictorMode)) return false;
    if (parsed.scheduler.decoderSource !== undefined && !['generated', 'external'].includes(parsed.scheduler.decoderSource)) return false;
    if (parsed.scheduler.memoryCoreId !== undefined && typeof parsed.scheduler.memoryCoreId !== 'string') return false;
    for (const core of parsed.scheduler.coresList) {
      if (!core || typeof core !== 'object') return false;
      if (
        typeof core.id !== 'string' ||
        typeof core.name !== 'string' ||
        typeof core.count !== 'number' ||
        typeof core.stroke !== 'string'
      ) return false;
    }

    // 2. Decoder Parameters Validation
    if (!parsed.decoder || typeof parsed.decoder !== 'object') return false;
    const decParams = ['instBitWidth', 'instRegs', 'instOperands', 'instImm', 'microopBitWidth'];
    for (const p of decParams) {
      if (!(p in parsed.decoder) || typeof (parsed.decoder as unknown as Record<string, unknown>)[p] !== 'number') return false;
    }
    if (typeof parsed.decoder.isaName !== 'string') return false;

    // 3. Formats Validation
    if (!Array.isArray(parsed.formats)) return false;
    for (const fmt of parsed.formats) {
      if (!fmt || typeof fmt !== 'object') return false;
      if (typeof fmt.id !== 'string' || typeof fmt.name !== 'string' || !Array.isArray(fmt.fields)) return false;
      for (const fd of fmt.fields) {
        if (!fd || typeof fd !== 'object') return false;
        if (
          typeof fd.id !== 'string' ||
          typeof fd.name !== 'string' ||
          typeof fd.msb !== 'number' ||
          typeof fd.lsb !== 'number' ||
          typeof fd.role !== 'string'
        ) return false;
      }
      if (fmt.signExtendImmediate !== undefined && typeof fmt.signExtendImmediate !== 'boolean') return false;
      if (fmt.immediateParts !== undefined) {
        if (!Array.isArray(fmt.immediateParts)) return false;
        for (const part of fmt.immediateParts) {
          if (!part || typeof part.id !== 'string' ||
              !Number.isInteger(part.sourceMsb) || !Number.isInteger(part.sourceLsb) ||
              !Number.isInteger(part.targetLsb)) return false;
        }
      }
    }

    // 4. Instructions Validation
    if (!Array.isArray(parsed.instructions)) return false;
    for (const inst of parsed.instructions) {
      if (!inst || typeof inst !== 'object') return false;
      const instFields = [
        'id',
        'name',
        'formatId',
        'conditions',
        'exPathId',
        'microop',
        'newregAlloc',
        'jump',
        'jumpReg',
        'branch'
      ];
      for (const f of instFields) {
        if (!(f in inst)) return false;
      }
      if (
        typeof inst.id !== 'string' ||
        typeof inst.name !== 'string' ||
        typeof inst.formatId !== 'string' ||
        typeof inst.conditions !== 'object' ||
        typeof inst.exPathId !== 'string' ||
        typeof inst.microop !== 'number' ||
        typeof inst.newregAlloc !== 'boolean' ||
        typeof inst.jump !== 'boolean' ||
        typeof inst.jumpReg !== 'boolean' ||
        typeof inst.branch !== 'boolean'
      ) return false;
    }

    return true;
  };

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
