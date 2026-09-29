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
  coresList: CoreTypeConfig[];
  prmUpdate: number;
  prmBuffer: number;
  unallocatePhyreg: number;
  flowWindows: number;
  enableMemoryOrder?: boolean;
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
  return rtlSourceSets[platform === 'oryukdo' ? 'oryukdo' : 'eulsukdo'];
}

export function validateSchedulerConfig(config: SchedulerConfig): string | null {
  if (config.platform !== undefined && config.platform !== 'eulsukdo' && config.platform !== 'oryukdo')
    return '플랫폼은 을숙도 또는 오륙도여야 합니다.';
  if (config.predictorMode !== undefined && config.predictorMode !== 'static' && config.predictorMode !== 'external')
    return '분기예측기 설정이 올바르지 않습니다.';
  if (config.platform !== 'oryukdo' && config.predictorMode === 'external')
    return '외부 분기예측기는 오륙도 프로파일에서 선택하세요.';
  if (config.decoderSource !== undefined && config.decoderSource !== 'generated' && config.decoderSource !== 'external')
    return '디코더 입력 방식을 선택하세요.';
  const positive = [config.decodeWidth, config.phyRegs, config.robEntries, config.prmUpdate,
    config.prmBuffer, config.unallocatePhyreg, config.flowWindows, config.instBitWidth ?? 32,
    config.instRegs ?? 32, config.instImm ?? 32, config.microopBitWidth ?? 5];
  if (positive.some(value => !Number.isSafeInteger(value) || value < 1)) return '모든 구조 및 ISA 파라미터는 1 이상의 정수여야 합니다.';
  if (config.phyRegs < (config.instRegs ?? 32)) return '물리 레지스터 수는 ISA 레지스터 수 이상이어야 합니다.';
  if (config.robEntries < config.decodeWidth || config.phyRegs < config.decodeWidth)
    return 'IST와 물리 레지스터 수는 디코드 폭 이상이어야 합니다.';
  if (config.flowWindows < 2 || config.robEntries < 2) return 'Flow window와 IST는 각각 2개 이상이어야 합니다.';
  if (config.instOperands !== undefined && config.instOperands !== 2)
    return '현재 디코더 생성은 소스 오퍼랜드 2개를 지원합니다.';
  if (!config.coresList || config.coresList.length < 2 || config.coresList.some(core => !Number.isSafeInteger(core.count) || core.count < 1))
    return '실행 경로를 2종류 이상 만들고 각 경로에 코어를 1개 이상 배치하세요.';
  if (config.enableMemoryOrder) {
    const memoryCore = config.coresList.find(core => core.id === config.memoryCoreId);
    if (!memoryCore) return 'LSQ를 사용할 메모리 EX 경로를 선택하세요.';
    if (memoryCore.count !== 1) return '현재 LSQ는 메모리 EX 인스턴스 1개만 지원합니다.';
  }
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
  const memoryPath = config.coresList.findIndex(core => core.id === config.memoryCoreId);
  const memoryWbcLane = config.coresList.slice(0, memoryPath).reduce((sum, core) => sum + core.count, 0);
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
    ENABLE_MEMORY_ORDER: config.enableMemoryOrder ? "1'b1" : "1'b0",
    STRUCT_MEM_EX_PATH: String(memoryPath >= 0 ? memoryPath : config.coresList.length - 1),
    STRUCT_MEM_WBC_LANE: String(memoryPath >= 0 ? memoryWbcLane : totalCores - 1),
  };
  if (config.platform === 'oryukdo') Object.assign(defaults, {
    ENABLE_STORE_COMMIT: config.enableMemoryOrder ? "1'b1" : "1'b0",
    ENABLE_RECOVERY_TRACKING: "1'b1",
    ENABLE_EXTERNAL_PREDICTOR: config.predictorMode === 'external' ? "1'b1" : "1'b0",
  });
  const headerEnd = schedulerSource.indexOf('\n);');
  if (headerEnd < 0) throw new Error('Scheduler module header not found');
  let header = schedulerSource.slice(0, headerEnd + 3)
    .replace('module eulsukdo_scheduler #(', 'module eulsukdo_example_top #(');
  for (const [name, value] of Object.entries(defaults)) {
    const pattern = new RegExp(`^(\\s*parameter (?:int|bit) ${name}(?:\\[[^\\]]+\\])?\\s*=\\s*)[^\\n]*?(?=,\\s*$)`, 'm');
    if (!pattern.test(header)) throw new Error(`Scheduler parameter not found: ${name}`);
    header = header.replace(pattern, (_, prefix: string) => `${prefix}${value}`);
  }
  // ORYUKDO supplies cause from the external privileged/ISA integration.
  const decoderLines = header.split('\n').filter(line =>
    /^\s*input\s+wire\s+.*i_nel_decode_\w+,?\s*$/.test(line) &&
    !line.includes('i_nel_decode_exception_cause'));
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
  return `${header}\n\n${decoderBlock}\n\n    eulsukdo_scheduler #(\n${Object.keys(defaults).map(name => `        .${name}(${name})`).join(',\n')},\n        .IS_INST_PC_BITWIDTH(IS_INST_PC_BITWIDTH),\n        .IS_INST_PC_STEP(IS_INST_PC_STEP),\n        .STRUCT_FLOW_PC_MAX_RANGE(STRUCT_FLOW_PC_MAX_RANGE)\n    ) U_SCHEDULER_CORE (\n${ports}${schedulerDecoderConnections}\n    );\n\n    // == EX Area START ==\n    // -- EX Instances --\n    // ==   EX Area END   ==\nendmodule\n`;
}
