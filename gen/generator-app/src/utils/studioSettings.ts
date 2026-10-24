import type { SchedulerConfig } from './rtlGenerator';
import type { DecoderParamConfig, InstructionFormat, InstructionConfig } from './decoderGenerator';

export interface StudioSettings {
  projectName?: string;
  scheduler: SchedulerConfig;
  decoder: DecoderParamConfig;
  formats: InstructionFormat[];
  instructions: InstructionConfig[];
}

// Validation function for the entire global CAD configuration schema
export const validateFullConfig = (data: unknown): data is StudioSettings => {
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
  if (parsed.scheduler.lsqEntries !== undefined && typeof parsed.scheduler.lsqEntries !== 'number') return false;
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
      !inst.conditions || typeof inst.conditions !== 'object' || Array.isArray(inst.conditions) ||
      typeof inst.exPathId !== 'string' ||
      typeof inst.microop !== 'number' ||
      typeof inst.newregAlloc !== 'boolean' ||
      typeof inst.jump !== 'boolean' ||
      typeof inst.jumpReg !== 'boolean' ||
      typeof inst.branch !== 'boolean'
    ) return false;
    if (!Object.values(inst.conditions).every(value => typeof value === 'string')) return false;
  }

  return true;
};

