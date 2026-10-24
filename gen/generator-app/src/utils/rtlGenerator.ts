import { rtlSourceSets, sourceVersions } from './platformSources';

export interface CoreTypeConfig {
  id: string;
  name: string;
  count: number;
  stroke: string;
}

export interface SchedulerConfig {
  platform?: 'eulsukdo' | 'oryukdo';
  predictorMode?: 'static' | 'external';
  decoderSource?: 'generated' | 'external';
  decodeWidth: number;
  phyRegs: number;
  robEntries: number;
  rsFifoEntries?: number;
  istIssueWidth?: number;
  istBanks?: number;
  coresList: CoreTypeConfig[];
  prmUpdate: number;
  prmBuffer: number;
  unallocatePhyreg: number;
  flowWindows: number;
  flowPcMaxRange?: number;
  enableMemoryOrder?: boolean;
  lsqEntries?: number;
  memoryCoreId?: string;
  isaName?: string;
  instBitWidth?: number;
  instRegs?: number;
  instOperands?: number;
  instImm?: number;
  microopBitWidth?: number;
}

export { sourceVersions };
export function rtlSourcesFor(platform: SchedulerConfig['platform']): Record<string, string> {
  if (platform !== undefined && platform !== 'eulsukdo') throw new Error('오륙도는 추후 제공 예정입니다.');
  return rtlSourceSets.eulsukdo;
}

export function validateSchedulerConfig(config: SchedulerConfig): string | null {
  if (config.platform === 'oryukdo') return '오륙도는 추후 제공 예정입니다.';
  if (config.enableMemoryOrder !== undefined && typeof config.enableMemoryOrder !== 'boolean')
    return 'LSQ 사용 여부는 불리언이어야 합니다.';
  if (config.platform !== undefined && config.platform !== 'eulsukdo' && config.platform !== 'oryukdo')
    return '플랫폼은 을숙도 또는 오륙도여야 합니다.';
  if (config.predictorMode !== undefined && config.predictorMode !== 'static' && config.predictorMode !== 'external')
    return '분기예측기 설정이 올바르지 않습니다.';
  if (config.predictorMode === 'external')
    return '외부 분기예측기는 오륙도에서만 사용할 수 있습니다.';
  if (config.decoderSource !== undefined && config.decoderSource !== 'generated' && config.decoderSource !== 'external')
    return '디코더 입력 방식을 선택하세요.';
  const positive = [config.decodeWidth, config.phyRegs, config.robEntries, config.prmUpdate,
    config.prmBuffer, config.unallocatePhyreg, config.flowWindows, config.instBitWidth ?? 32,
    config.instRegs ?? 32, config.instImm ?? 32, config.microopBitWidth ?? 5];
  if (positive.some(value => !Number.isSafeInteger(value) || value < 1)) return '모든 구조 및 ISA 파라미터는 1 이상의 정수여야 합니다.';
  if (config.flowPcMaxRange !== undefined && (!Number.isSafeInteger(config.flowPcMaxRange) || config.flowPcMaxRange < 1))
    return '모든 구조 및 ISA 파라미터는 1 이상의 정수여야 합니다.';
  if (config.phyRegs < (config.instRegs ?? 32)) return '물리 레지스터 수는 ISA 레지스터 수 이상이어야 합니다.';
  if (config.robEntries < config.decodeWidth || config.phyRegs < config.decodeWidth)
    return 'IST 엔트리 수와 물리 레지스터 수는 각각 디코드 폭 이상이어야 합니다.';
  if (config.flowWindows < 2 || config.robEntries < 2) return '플로 윈도 수와 IST 엔트리 수는 각각 2 이상이어야 합니다.';
  if (config.instOperands !== undefined && config.instOperands !== 2)
    return '소스 피연산자 수는 현재 2개만 지원합니다.';
  if (!config.coresList || config.coresList.length < 2 || config.coresList.some(core => !Number.isSafeInteger(core.count) || core.count < 1))
    return 'EX 실행 경로를 2개 이상 만들고 각 경로에 실행 유닛을 1개 이상 배치하세요.';
  if (config.lsqEntries !== undefined && (!Number.isSafeInteger(config.lsqEntries) || config.lsqEntries < 1))
    return 'LSQ 엔트리 수는 1 이상의 정수여야 합니다.';
  if (config.enableMemoryOrder) {
    if (config.coresList.filter(core => core.id === config.memoryCoreId).length !== 1)
      return 'LSQ를 사용할 메모리 EX 경로를 선택하세요.';
    if ((config.lsqEntries ?? 32) < config.decodeWidth)
      return 'LSQ 엔트리 수는 디코드 폭 이상이어야 합니다.';
  }
  const issue = config.istIssueWidth ?? config.coresList.reduce((sum, core) => sum + core.count, 0);
  const banks = config.istBanks ?? 2 ** Math.ceil(Math.log2(Math.max(config.decodeWidth, issue)));
  if ([config.istIssueWidth, config.istBanks, config.rsFifoEntries, issue, banks]
    .some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 1)))
    return 'IST 발행 폭·뱅크 수와 RS FIFO 엔트리 수는 1 이상의 정수여야 합니다.';
  if (!Number.isInteger(Math.log2(banks)) || banks < config.decodeWidth)
    return 'IST 뱅크 수는 디코드 폭 이상의 2의 거듭제곱이어야 합니다.';
  if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(config.isaName ?? 'eulsukdo'))
    return 'ISA 이름은 SystemVerilog 식별자로 작성하세요.';
  return null;
}

// Mirror the public port and localparam declarations from the actual gen scheduler.
// Generated decoder inputs become internal wires; external decode inputs remain ports.
export function generateRTL(config: SchedulerConfig): string {
  const error = validateSchedulerConfig(config);
  if (error) throw new Error(error);
  const schedulerSource = rtlSourcesFor(config.platform)['eulsukdo_scheduler.sv'];

  const totalCores = config.coresList.reduce((sum, core) => sum + core.count, 0);
  // Match Studio's legacy-JSON default even when LSQ is off, so browser and
  // auto-create produce the same wrapper from settings without memoryCoreId.
  const memoryPath = config.coresList.findIndex(core => config.memoryCoreId === undefined
    ? core.name.toLowerCase() === 'memory' : core.id === config.memoryCoreId);
  const defaults: Record<string, string> = {
    IS_INST_BITWIDTH: String(config.instBitWidth ?? 32),
    IS_INST_REGS: String(config.instRegs ?? 32),
    IS_INST_OPERANDS: String(config.instOperands ?? 2),
    IS_INST_IMM: String(config.instImm ?? 32),
    EX_INST_MICROOP_BITWIDTH: String(config.microopBitWidth ?? 5),
    STRUCT_DECODE_NEW_INST: String(config.decodeWidth),
    STRUCT_INST_STATE_ENTRIES: String(config.robEntries),
    STRUCT_PHYREGS: String(config.phyRegs),
    STRUCT_EX_PATH: String(config.coresList.length),
    STRUCT_RS_OUT_ENTRY: `{${config.coresList.map(core => core.count).join(', ')}}`,
    STRUCT_EX_CORES: String(totalCores),
    STRUCT_EX_OUT_RESULT: `{${Array(totalCores).fill(1).join(', ')}}`,
    STRUCT_EX_OUT_RESULT_SUM: String(totalCores),
    STRUCT_EX_BRANCH: '1',
    STRUCT_PRM_ENTRY_UPDATE: String(config.prmUpdate),
    STRUCT_PRM_ENTRY_BUFFER: String(config.prmBuffer),
    STRUCT_UNALLOCATE_PHYREG: String(config.unallocatePhyreg),
    STRUCT_FLOW_WINDOWS: String(config.flowWindows),
    STRUCT_FLOW_PC_MAX_RANGE: String(config.flowPcMaxRange ?? 16),
    STRUCT_RS_FIFO_WIDTH: String(config.rsFifoEntries ?? 128),
    ENABLE_LSQ: config.enableMemoryOrder ? "1'b1" : "1'b0",
    STRUCT_LSQ_ENTRIES: String(config.lsqEntries ?? 32),
    // This is a PATH index, not the first issue/WBC lane of that path.
    STRUCT_LSQ_EX_PATH: String(Math.max(0, memoryPath)),
    STRUCT_IST_ISSUE_WIDTH: config.istIssueWidth === undefined ? 'STRUCT_EX_CORES' : String(config.istIssueWidth),
    STRUCT_IST_BANKS: config.istBanks === undefined
      ? '1 << $clog2((STRUCT_DECODE_NEW_INST > STRUCT_IST_ISSUE_WIDTH) ? STRUCT_DECODE_NEW_INST : STRUCT_IST_ISSUE_WIDTH)'
      : String(config.istBanks),
  };
  const headerEnd = schedulerSource.indexOf('\n);');
  if (headerEnd < 0) throw new Error('Scheduler module header not found');
  let header = schedulerSource.slice(0, headerEnd + 3)
    .replace('module eulsukdo_scheduler #(', 'module eulsukdo_example_top #(');
  for (const [name, value] of Object.entries(defaults)) {
    const pattern = new RegExp(`^(\\s*parameter (?:int|bit) ${name}(?:\\[[^\\]]+\\])?\\s*=\\s*)[\\s\\S]*?(?=,[ \\t]*\\r?$)`, 'm');
    if (!pattern.test(header)) throw new Error(`Scheduler parameter not found: ${name}`);
    header = header.replace(pattern, (_, prefix: string) => `${prefix}${value}`);
  }
  const decoderLines = header.split('\n').filter(line =>
    /^\s*input\s+wire\s+.*i_nel_decode_\w+,?\s*$/.test(line));
  if (decoderLines.length !== 10) throw new Error('Scheduler decoder port list changed');
  const generatedDecoder = config.decoderSource !== 'external';
  if (generatedDecoder) header = header.split('\n').filter(line => !decoderLines.includes(line)).join('\n');
  const internalWires = generatedDecoder
    ? decoderLines.map(line => line.replace('input  wire', 'wire       ').replace(/,\s*$/, ';')).join('\n') : '';
  const portNames = [...header.matchAll(/^\s*(?:input|output)\s+wire\s+(?:\[[^\]]+\]\s+)?(\w+),?\s*$/gm)].map(match => match[1]);
  const ports = portNames.map(name => `        .${name.padEnd(30)}(${name})`).join(',\n');
  const decoderPorts: Record<string, string> = {
    rd_o: 'rd', rs_o: 'rs', exception_o: 'exception', newreg_alloc_o: 'newreg',
    jump_o: 'jump', jump_reg_o: 'jump_reg', branch_o: 'branch',
    expath_o: 'expath', microop_o: 'microop', imm_o: 'imm',
  };
  const widths: Record<string, string> = {
    rd_o: '_BITWIDTH_IS_INST_REGS', rs_o: '(IS_INST_OPERANDS*_BITWIDTH_IS_INST_REGS)',
    expath_o: '_BITWIDTH_STRUCT_EX_PATH', microop_o: 'EX_INST_MICROOP_BITWIDTH', imm_o: 'IS_INST_IMM',
  };
  const decoderConnections = Object.entries(decoderPorts).map(([out, name]) => {
    const width = widths[out];
    const slice = width ? `[d_idx*${width} +: ${width}]` : '[d_idx]';
    return `            .${out.padEnd(18)}(i_nel_decode_${name}${slice})`;
  }).join(',\n');

  const decoderBlock = generatedDecoder ? `    // ISA decoder generated for each input lane.\n${internalWires}\n\n    genvar d_idx;\n    generate\n        for (d_idx = 0; d_idx < STRUCT_DECODE_NEW_INST; d_idx = d_idx + 1) begin : GEN_DECODER\n            ${config.isaName ?? 'eulsukdo'}_decoder #(\n                .IS_INST_BITWIDTH(IS_INST_BITWIDTH),\n                .IS_INST_REGS(IS_INST_REGS),\n                .IS_INST_OPERANDS(IS_INST_OPERANDS),\n                .IS_INST_IMM(IS_INST_IMM),\n                .EX_INST_MICROOP_BITWIDTH(EX_INST_MICROOP_BITWIDTH),\n                .STRUCT_EX_PATH(STRUCT_EX_PATH)\n            ) U_DECODER (\n                .inst_i(i_im_recv_inst[d_idx*IS_INST_BITWIDTH +: IS_INST_BITWIDTH]),\n${decoderConnections}\n            );\n        end\n    endgenerate` : '    // i_nel_decode_* inputs are supplied by an external decoder or predecoded source.';
  const schedulerDecoderConnections = generatedDecoder ? `,\n${decoderLines.map(line => {
    const name = line.match(/(i_nel_decode_\w+)/)?.[1];
    return `        .${name?.padEnd(30)}(${name})`;
  }).join(',\n')}` : '';
  return `${header}\n\n${decoderBlock}\n\n    eulsukdo_scheduler #(\n${Object.keys(defaults).map(name => `        .${name}(${name})`).join(',\n')},\n        .IS_INST_PC_BITWIDTH(IS_INST_PC_BITWIDTH),\n        .IS_INST_PC_STEP(IS_INST_PC_STEP)\n    ) U_SCHEDULER_CORE (\n${ports}${schedulerDecoderConnections}\n    );\n\n    // == EX Area START ==\n    // -- EX Instances --\n    // ==   EX Area END   ==\nendmodule\n`;
}
