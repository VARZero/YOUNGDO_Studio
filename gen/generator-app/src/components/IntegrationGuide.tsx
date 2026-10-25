import type { Language } from '../utils/locale';
import type { SchedulerConfig } from '../utils/rtlGenerator';

export function IntegrationGuide({ language, config }: { language: Language; config: SchedulerConfig }) {
  const text = (ko: string, en: string) => language === 'ko' ? ko : en;
  if (config.platform === 'oryukdo') return <section className="studio-integration-guide" aria-labelledby="integration-guide-title">
    <h2 id="integration-guide-title">{text('오륙도 Gen2 연결 안내', 'ORYUKDO Gen2 integration guide')}</h2>
    <p>{text('ZIP은 복구 가능한 스케줄러와 선택한 디코더입니다. 프런트엔드, 실제 EX, 데이터 레지스터 파일, MMU와 CSR 실행기는 외부에 연결합니다. 완성 CPU가 아닙니다.', 'The ZIP contains a recoverable scheduler and the selected decoder. Supply the frontend, EX implementations, data register file, MMU and CSR executor. It is not a complete CPU.')}</p>
    <details open className="studio-guide-section"><summary>{text('1. 프런트엔드와 명령 분류', '1. Frontend and instruction classification')}</summary><div className="studio-guide-body">
      <p><code>o_fetch_pc / o_fetch_epoch → i_decode_pc / i_decode_epoch / i_decode_valid / o_decode_get</code></p>
      <p>{text('PC 순서의 연속 valid 묶음을 보내고 접수될 때까지 유지하세요. epoch 변경과 o_flush를 따라 이전 응답을 폐기합니다. 리셋 해제 후 첫 에지까지 i_reset_pc를 유지합니다. 코어가 접수하지 않은 뒤쪽 명령은 새 fetch PC를 따라 다시 제시해야 합니다.', 'Present a contiguous valid prefix in PC order and hold it until accepted. Discard stale responses on epoch change or o_flush. Hold i_reset_pc through the first edge after reset release. Re-present an unaccepted suffix according to the new fetch PC.')}</p>
      <p>{text('생성 디코더는 i_instruction에서 레지스터·즉시값·micro-op·제어 명령을 해석하고 선택한 EX 경로를 메모리로 분류합니다. i_decode_store, i_decode_csr, i_decode_end는 이 모드에서도 프런트엔드 입력입니다. Store를 Load로 처리하지 않도록 올바르게 분류하고 CSR은 메모리 경로와 분리하세요. i_frontend_exception/cause는 명령 인출 오류이며 생성 디코더의 illegal 예외보다 우선합니다. illegal 원인은 2입니다.', 'Generated decode reads i_instruction for registers, immediate, micro-op and control flags; the selected EX path is classified as memory. The frontend still supplies i_decode_store, i_decode_csr and i_decode_end. Classify stores correctly and keep CSR distinct from memory. i_frontend_exception/cause reports fetch faults and takes priority over generated illegal-instruction cause 2.')}</p>
      <p>{text('외부 디코더 모드에서는 모든 i_decode_* 필드를 직접 제공합니다. i_decode_store이면 i_decode_memory도 1이어야 합니다. PC·데이터 폭은 32, PC 증분은 4, generation/epoch는 32비트입니다.', 'External decode supplies every i_decode_* field. A store must also be classified as memory. PC/data widths are 32, PC step is 4, and generation/epoch widths are 32 bits.')}</p>
    </div></details>
    <details className="studio-guide-section"><summary>{text('2. EX 결과와 레지스터 파일', '2. EX results and register file')}</summary><div className="studio-guide-body">
      <p><code>o_ex_valid / i_ex_get / o_ex_data / o_ex_token</code> → <code>i_result_* / o_result_accept</code></p>
      <pre className="studio-guide-code"><code>{`// o_ex_data[lane*EX_W +: EX_W], MSB -> LSB:
// {rs2, rs1, rd, immediate, microop, path, flow, token, PC}
// token = {generation, slot}; rs/rd identify physical registers.
// Write the external RF ONLY on o_wb_valid using o_wb_phy/data/uop.
// o_result_accept is queue acceptance, not RF write authorization.`}</code></pre>
      <p>{text('일반 EX는 원래 token과 데이터·실제 다음 PC·예외를 반환하고 수락될 때까지 유지합니다. flush로 취소된 작업은 EX에서도 폐기하세요. 내부 Ready는 실제 RF 쓰기보다 한 사이클 늦습니다. 메모리 EX는 일반 결과 경로에 중복 반환하지 않고 AGU 경로를 사용합니다.', 'Normal EX returns the original token, data, actual next PC and fault, holding the result until accepted. EX must discard work canceled by flush. Internal Ready follows RF write by one cycle. Memory EX uses AGU instead of returning a duplicate normal result.')}</p>
    </div></details>
    <details className="studio-guide-section"><summary>{text('3. 메모리·MMU·CSR', '3. Memory, MMU and CSR')}</summary><div className="studio-guide-body">
      <p>{text('기본값은 기존 내장 LSQ이며 용량은 frontier 엔트리 수와 같습니다. 사용자 LSQ RTL을 선택하면 해당 구현으로 교체합니다. AGU는 주소·Store 데이터·바이트 마스크와 MMU 검사 결과를 i_agu_*로 전달합니다. MMIO 등 부작용 접근은 i_agu_nonspec으로 표시합니다. 내장 구현은 내부 Store 전달을 지원하고 외부 공개는 선행 윈도우 확정 뒤 진행합니다.', 'The existing built-in LSQ is the default, with capacity equal to frontier entries. Select User LSQ RTL to replace it. AGU supplies address, store data, byte mask and MMU checks on i_agu_*. Mark side-effecting accesses with i_agu_nonspec. The built-in engine forwards stores internally and waits for older windows before publication.')}</p>
      {config.lsqMode === 'custom' && <>
        <p><code>CUSTOM_LSQ=1 · RTL/custom_lsq/oryukdo_custom_lsq.sv</code></p>
        <p>{text('ZIP의 시작 파일은 내장 메모리 엔진을 호출합니다. 이 파일 내부를 직접 구현하거나 자신이 만든 LSQ 모듈을 연결하세요. 같은 이름의 모듈은 하나만 컴파일합니다. 교체할 때까지 기존 동작을 유지합니다.', 'The ZIP starter delegates to the built-in memory engine. Replace its body or instantiate your LSQ module inside it. Compile exactly one module with this name. Behavior remains unchanged until you replace the starter.')}</p>
        <p>{text('i_reserve는 입력 묶음 미리보기이며 o_allocate_ready로 수용 가능 여부를 반환합니다. 실제 저장은 i_allocate와 i_token으로만 합니다. ready를 i_allocate나 i_token에 의존시키면 안 됩니다. 입력 정체 시 기존 부분 윈도우는 확정될 수 있습니다. AGU·완료 handshake, Store 공개 허가, MMIO 순서, flush와 미완료 버스 응답 처리를 구현해야 합니다. 전체 계약은 ZIP의 INTEGRATION.md를 참고하세요.', 'i_reserve previews the bundle and o_allocate_ready reports capacity. Record only i_allocate with i_token; never derive ready from these admission-dependent signals. Stalls may seal partial windows. Implement AGU/completion handshakes, store publication authorization, MMIO ordering, flush and draining outstanding bus responses. See INTEGRATION.md in the ZIP for the contract.')}</p>
      </>}
      <p><code>o_mem_* / i_mem_ready / i_mem_response_* / o_mem_response_ready</code>: {text('외부 버스는 한 트랜잭션씩 처리합니다. 응답은 요청 완료를 뜻하며 Store 오류는 부분적인 외부 쓰기가 없다는 계약이 필요합니다. CSR은 순서가 된 뒤 실행하고 완료를 반환합니다. 인터럽트는 확정된 윈도우 경계에서 처리하며, trap 시 외부 CSR 장치가 상태와 인터럽트 조건을 갱신해야 합니다.', 'The external bus handles one transaction at a time. A response acknowledges completion; a precise store fault requires no partial external write. Execute CSR at ordered issue and return completion. Interrupts are taken at confirmed window boundaries; external CSR logic must update trap state and interrupt eligibility.')}</p>
    </div></details>
    <details className="studio-guide-section"><summary>{text('4. 분기예측과 검증', '4. Prediction and verification')}</summary><div className="studio-guide-body">
      <p>{text('정적 모드는 다음 순차 PC를 예측합니다. 외부 모드는 정적 예측기를 제거하고 요청의 PC·epoch와 일치하는 i_predict_* 응답을 기다립니다. 응답이 없으면 분기 접수가 정체되며 정적 fallback은 없습니다. 생성 RTL의 연결 검사는 시스템 기능 및 클럭 검증을 대신하지 않습니다.', 'Static mode predicts the sequential PC. External mode removes static prediction and waits for an i_predict_* response matching the request PC and epoch. Missing responses stall control admission; there is no static fallback. Generated connection checks do not replace system functionality or timing validation.')}</p>
      <pre className="studio-guide-code"><code>{`verilator --lint-only -Wno-WIDTH --unroll-count 256 --top-module oryukdo_example_top RTL/*_top.sv ${config.decoderSource !== 'external' ? 'RTL/*_decoder.sv ' : ''}RTL/oryukdo_rtl/*.sv${config.lsqMode === 'custom' ? ' RTL/custom_lsq/*.sv' : ''}`}</code></pre>
    </div></details>
  </section>;
  return <section className="studio-integration-guide" aria-labelledby="integration-guide-title">
    <h2 id="integration-guide-title">{text('Gen2 연결 안내', 'Gen2 integration guide')}</h2>
    <p>{text('ZIP에는 현재 을숙도 Gen2 스케줄러와 선택한 디코더가 들어갑니다. EX 실행 유닛, 데이터용 물리 레지스터 파일과 메모리는 사용자 프로젝트에서 연결하세요. 기본 ADD/SUB/LW 설정은 예시이며 전체 RV32I 코어가 아닙니다.', 'The ZIP includes the current Gen2 scheduler and selected decoder. Supply EX units, the physical register data file and memory. Default ADD/SUB/LW settings are examples, not a complete RV32I core.')}</p>
    <details open className="studio-guide-section">
      <summary>{text('1. 실행 유닛과 완료 신호', '1. Execution units and completion')}</summary>
      <div className="studio-guide-body">
        <p><code>o_rs_entry_valid / i_rs_entry_get / o_rs_entry_data</code>: {text('valid와 get이 동시에 1인 클록 에지에서 명령을 수락합니다. EX가 대기하면 get을 내립니다. 경로 목록 순서대로 발행 및 WBC 레인이 배정됩니다.', 'Accept on a clock edge with valid and get high. Deassert get while EX is stalled. Issue and WBC lanes follow path-list order.')}</p>
        <pre className="studio-guide-code"><code>{`// Packed fields, MSB -> LSB. flow_pc_key = {flow_id, PC}.
// o_rs_entry_data[lane*W +: W]:
// {source_phyregs, dest_phyreg, immediate, microop, expath, flow_pc_key}
// W = _BITWIDTH_EX_INST_WIDTH
// i_wbc_result_data[lane*R +: R]:
// {dest_phyreg, flow_pc_key}
// R = _BITWIDTH_EX_RESULT_WIDTH
// i_wbc_result_branch_data:
// {resolved_next_PC, original_flow_pc_key}`}</code></pre>
        <p>{text('rs/rd는 데이터 값이 아닌 물리 레지스터 번호입니다. 실제 결과는 외부 레지스터 파일에 기록하고, 같은 명령의 완료 메타데이터를 i_wbc_result_valid/data로 한 번 보고합니다. 목적 레지스터가 없는 명령도 PC 완료를 보고하며 rd는 0입니다. WBC 입력에는 재시도용 ready가 없습니다.', 'rs/rd are physical register identifiers. Write actual results to your external register file and report matching completion metadata once on i_wbc_result_valid/data. Instructions without a destination still report PC completion with rd=0. WBC has no retry-ready input.')}</p>
        <p><code>i_wbc_result_branch_valid / i_wbc_result_branch_data</code>: {text('분기·레지스터 점프의 해결 결과는 {실제 다음 PC, 원래 Flow ID, 원래 명령의 PC}입니다. 분기가 성립하지 않으면 순차 다음 PC를 보냅니다. 일반 WBC 완료도 별도로 보고하세요. 현재 생성기의 분기 결과 레인은 1개입니다.', 'Report branch/register-jump resolution as {actual next PC, original flow ID, original instruction PC}. Return the sequential next PC for a not-taken branch and also report normal WBC completion. The generated top has one branch-result lane.')}</p>
      </div>
    </details>
    <details className="studio-guide-section">
      <summary>{text('2. 명령어 입력과 구조 파라미터', '2. Instruction input and structure parameters')}</summary>
      <div className="studio-guide-body">
        <p><code>o_im_req_pc_valid / i_im_req_pc_get / o_im_req_pc</code> → <code>i_im_recv_inst_valid / o_im_recv_inst_get / i_im_recv_pc / i_im_recv_inst</code></p>
        <p>{text('요청에서 받은 {Flow ID, PC}를 응답에 그대로 돌려주고, 수락될 때까지 명령과 키를 유지하세요. 외부 디코더 모드에서는 i_nel_decode_*도 응답 명령과 함께 유지합니다. PC가 키의 하위 비트입니다.', 'Echo the requested {flow ID, PC} unchanged with the instruction response, holding both until accepted. In external decoder mode, hold i_nel_decode_* alongside that instruction. PC occupies the low key bits.')}</p>
        <p>{text('IST 발행 폭과 뱅크 수를 비우면 발행 폭은 EX 수, 뱅크 수는 디코드·IST 발행 폭 중 큰 값 이상의 최소 2의 거듭제곱으로 정해집니다. 경로별 RS FIFO 엔트리는 STRUCT_RS_FIFO_WIDTH에 연결되며 비트 폭이 아닙니다. 실제 저장 공간은 FIFO 행과 부가 버퍼 때문에 더 클 수 있습니다.', 'Automatic IST issue width follows EX count; automatic banks round max(decode, IST issue) up to a power of two. RS FIFO entries per path set STRUCT_RS_FIFO_WIDTH, an instruction capacity rather than a bit width. Row rounding and staging buffers add storage.')}</p>
      </div>
    </details>
    <details className="studio-guide-section">
      <summary>{text('3. 선택형 LSQ와 메모리 완료', '3. Optional LSQ and memory completion')}</summary>
      <div className="studio-guide-body">
        <p>{text('LSQ를 켜면 NEL→IST 접수 순서를 아래 FIFO에, RS에서 준비된 명령을 위 FIFO에 보관합니다. Flow Window + 전체 PC가 일치하면 실행을 시작하고, 같은 태그의 WBC 완료 후 두 head를 제거합니다. 기본 깊이는 32이며 디코드 폭 이상이어야 합니다.', 'With LSQ enabled, the lower FIFO records NEL-to-IST order and the upper FIFO holds ready RS commands. Matching Flow Window + full PC starts execution; matching WBC completion removes both heads. Default depth is 32 and must be at least the decode width.')}</p>
        <p>{text('선택한 EX 경로의 모든 명령을 직렬화합니다. 복수 실행 레인을 지원하지만 경로 전체에서 실행 중인 메모리 명령은 하나입니다. Store도 다음 메모리 명령을 시작해도 되는 시점에 rd=0과 원래 태그로 완료를 보고해야 합니다. LSQ는 RS와 EX 사이에 있으며 AGU와 실제 메모리는 EX에서 연결합니다.', 'All instructions on the selected EX path are serialized. Multiple execution lanes are supported, with one memory command in flight across the path. Stores must report rd=0 and the original tag only when the next memory operation may start. LSQ sits between RS and EX; connect the AGU and actual memory in EX.')}</p>
        <p>{text('LSQ 기본값은 꺼짐입니다. 오륙도 복구·분기예측, 주소 비교와 Store-to-Load forwarding은 포함하지 않습니다.', 'LSQ defaults to off. ORYUKDO recovery/prediction, address comparison and Store-to-Load forwarding are not included.')}</p>
      </div>
    </details>
    <details className="studio-guide-section">
      <summary>{text('4. 통합 검증', '4. Integration verification')}</summary>
      <div className="studio-guide-body"><p>{text('SOURCE_VERSION.json과 설정 JSON을 보관하세요. 내보낸 RTL을 시스템 최상위 모듈에 연결하고 의존 명령, EX 대기, 동시 완료, 분기와 리셋을 시뮬레이션하세요. 화면의 설정 검사는 시스템 동작 검증을 대신하지 않습니다.', 'Keep SOURCE_VERSION.json and settings JSON. Connect the exported RTL in your system top and simulate dependencies, EX stalls, simultaneous completion, branches and reset. Configuration checks do not replace system simulation.')}</p>
        <pre className="studio-guide-code"><code>{`verilator --lint-only -Wno-WIDTH --unroll-count 256 --top-module eulsukdo_example_top RTL/*_top.sv ${config.decoderSource !== 'external' ? 'RTL/*_decoder.sv ' : ''}RTL/eulsukdo_rtl/*.sv`}</code></pre>
      </div>
    </details>
  </section>;
}
