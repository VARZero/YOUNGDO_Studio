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
  if (platform !== undefined && platform !== 'eulsukdo' && platform !== 'oryukdo') throw new Error('Unknown platform');
  return rtlSourceSets[platform ?? 'eulsukdo'];
}

export function validateSchedulerConfig(config: SchedulerConfig): string | null {
  const oryukdo = config.platform === 'oryukdo';
  if (config.enableMemoryOrder !== undefined && typeof config.enableMemoryOrder !== 'boolean')
    return 'LSQ 사용 여부는 불리언이어야 합니다.';
  if (config.platform !== undefined && config.platform !== 'eulsukdo' && config.platform !== 'oryukdo')
    return '플랫폼은 을숙도 또는 오륙도여야 합니다.';
  if (config.predictorMode !== undefined && config.predictorMode !== 'static' && config.predictorMode !== 'external')
    return '분기예측기 설정이 올바르지 않습니다.';
  if (config.predictorMode === 'external' && !oryukdo)
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
  if (oryukdo) {
    if ((config.instRegs ?? 32) < 2 || config.phyRegs < (config.instRegs ?? 32) + config.decodeWidth)
      return '오륙도 PHY는 ISA 레지스터 수 + 디코드 폭 이상이어야 합니다.';
    if (config.prmBuffer !== 4 || config.unallocatePhyreg !== 1 || config.istBanks !== undefined)
      return '오륙도는 PRM 대기 슬롯 4, 반환 폭 1, 자동 IST 뱅크를 사용합니다.';
    if (config.enableMemoryOrder === false || (config.lsqEntries !== undefined && config.lsqEntries !== config.robEntries))
      return '오륙도 메모리 순서는 항상 켜지며 용량은 frontier 엔트리 수를 따릅니다.';
    if (config.decoderSource !== 'external' && config.coresList.filter(core => core.id === config.memoryCoreId).length !== 1)
      return '오륙도 생성 디코더의 메모리 EX 경로를 선택하세요.';
  }
  if (config.enableMemoryOrder && !oryukdo) {
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
  if (config.platform === 'oryukdo') return generateOryukdoRTL(config);
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


// The current ORYUKDO core accepts decoded instruction bundles. Keep its real
// token/epoch, AGU, memory, CSR, trap and prediction interfaces at the boundary.
function generateOryukdoRTL(config: SchedulerConfig): string {
  const source = rtlSourceSets.oryukdo['oryukdo_scheduler.sv'];
  const end = source.indexOf('\n);');
  if (end < 0) throw new Error('ORYUKDO scheduler module header not found');
  const total = config.coresList.reduce((sum, core) => sum + core.count, 0);
  const defaults: Record<string, string> = {
    PC_W: '32', DATA_W: '32', IMM_W: String(config.instImm ?? 32), UOP_W: String(config.microopBitWidth ?? 5),
    ARCH: String(config.instRegs ?? 32), PHY: String(config.phyRegs), DECODE: String(config.decodeWidth),
    ENTRIES: String(config.robEntries), WINDOWS: String(config.flowWindows), WINDOW_SIZE: String(config.flowPcMaxRange ?? 16),
    PC_STEP: '4', PATHS: String(config.coresList.length), EX_LANES: String(total),
    PATH_LANES: `'{${config.coresList.map(core => core.count).join(',')}}`,
    ISSUE: config.istIssueWidth === undefined ? 'EX_LANES' : String(config.istIssueWidth),
    UPDATES: String(config.prmUpdate), RS_DEPTH: String(config.rsFifoEntries ?? 128),
    GEN_W: '32', EPOCH_W: '32', EXTERNAL_PREDICTOR: config.predictorMode === 'external' ? "1'b1" : "1'b0",
  };
  let header = source.slice(0, end + 3).replace('module oryukdo_scheduler #(',
    `module oryukdo_example_top #(\n    parameter int INST_W=${config.instBitWidth ?? 32},`);
  for (const [name, value] of Object.entries(defaults)) {
    const pattern = new RegExp(String.raw`(\b${name}(?:\[[^\]]+\])?\s*=\s*)(?:'\{[^}]*\}|[^,\r\n]+)`);
    if (!pattern.test(header)) throw new Error(`ORYUKDO parameter not found: ${name}`);
    header = header.replace(pattern, (_, prefix: string) => prefix + value);
  }
  // Expand grouped ANSI declarations so ports can be selected by exact name.
  const portStart = header.indexOf(') (') + 3;
  const paramHeader = header.slice(0, portStart);
  const declarations: { name: string; direction: string; type: string; width: string }[] = [];
  for (const line of header.slice(portStart, -2).split('\n')) {
    const match = line.trim().replace(/,$/, '').match(/^(input|output)\s+(wire|logic)\s+(\[[^\]]+\]\s+)?(.+)$/);
    if (!match) continue;
    for (const name of match[4].split(',').map(value => value.trim()))
      declarations.push({ name, direction: match[1], type: match[2], width: match[3]?.trim() ?? '' });
  }
  if (declarations.length < 60) throw new Error('ORYUKDO port list changed');
  const generated = config.decoderSource !== 'external';
  const decoded = new Set(['path','uop','imm','rd','rs','write','control','memory','exception','cause'].map(name => `i_decode_${name}`));
  const internal = generated ? declarations.filter(port => decoded.has(port.name)) : [];
  const external = declarations.filter(port => !generated || !decoded.has(port.name));
  const newInputs = generated ? [
    'input wire [DECODE*INST_W-1:0] i_instruction',
    'input wire [DECODE-1:0] i_frontend_exception',
    'input wire [DECODE*5-1:0] i_frontend_cause',
  ] : [];
  const ports = [...external.map(port => `${port.direction} ${port.type} ${port.width} ${port.name}`), ...newInputs];
  header = `${paramHeader}\n    ${ports.join(',\n    ')}\n);`;
  const memoryPath = config.coresList.findIndex(core => core.id === config.memoryCoreId);
  const decoder = generated ? `
    // Frontend retains ownership until o_decode_get. Store/CSR/window-end
    // classification is supplied on i_decode_store/csr/end even in this mode.
    // Fetch faults take priority over the generated illegal-instruction cause 2.
${internal.map(port => `    wire ${port.width} ${port.name};`).join('\n')}
    for (genvar lane=0; lane<DECODE; lane++) begin : GEN_DECODER
        wire jump_flag, jump_reg_flag, branch_flag, illegal;
        ${config.isaName ?? 'eulsukdo'}_decoder #(
            .IS_INST_BITWIDTH(INST_W), .IS_INST_REGS(ARCH), .IS_INST_OPERANDS(2),
            .IS_INST_IMM(IMM_W), .EX_INST_MICROOP_BITWIDTH(UOP_W), .STRUCT_EX_PATH(PATHS)
        ) U_DECODER (
            .inst_i(i_instruction[lane*INST_W +: INST_W]),
            .rd_o(i_decode_rd[lane*ARCH_W +: ARCH_W]),
            .rs_o(i_decode_rs[lane*2*ARCH_W +: 2*ARCH_W]),
            .imm_o(i_decode_imm[lane*IMM_W +: IMM_W]),
            .microop_o(i_decode_uop[lane*UOP_W +: UOP_W]),
            .expath_o(i_decode_path[lane*PATH_W +: PATH_W]),
            .newreg_alloc_o(i_decode_write[lane]), .exception_o(illegal),
            .jump_o(jump_flag), .jump_reg_o(jump_reg_flag), .branch_o(branch_flag)
        );
        assign i_decode_control[lane]=jump_flag | jump_reg_flag | branch_flag;
        assign i_decode_memory[lane]=!illegal && i_decode_path[lane*PATH_W +: PATH_W]==PATH_W'(${memoryPath});
        assign i_decode_exception[lane]=i_frontend_exception[lane] | illegal;
        assign i_decode_cause[lane*5 +: 5]=i_frontend_exception[lane] ? i_frontend_cause[lane*5 +: 5] : 5'd2;
    end
` : '    // All i_decode_* fields are supplied by the external frontend/decoder.\n';
  return `${header}\n${decoder}\n    oryukdo_scheduler #(\n${Object.keys(defaults).map(name => `        .${name}(${name})`).join(',\n')}\n    ) U_SCHEDULER_CORE (\n${declarations.map(port => `        .${port.name}(${port.name})`).join(',\n')}\n    );\nendmodule\n`;
}
