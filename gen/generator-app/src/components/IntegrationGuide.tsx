import type { Language } from '../utils/locale';
import type { SchedulerConfig } from '../utils/rtlGenerator';

export function IntegrationGuide({ language, config }: { language: Language; config: SchedulerConfig }) {
  const text = (ko: string, en: string) => language === 'ko' ? ko : en;
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
      <summary>{text('3. LSQ·오륙도 — 추후 제공', '3. LSQ / ORYUKDO — coming later')}</summary>
      <div className="studio-guide-body"><p>{text('이번 버전에는 LSQ, 오륙도 복구 회로와 분기예측 인터페이스가 포함되지 않습니다. 해당 설정이 켜진 예전 JSON은 불러올 수 없습니다. 메모리 실행 유닛을 추가해도 메모리 순서 보장이 자동으로 추가되지 않습니다.', 'This release does not include LSQ, ORYUKDO recovery or predictor interfaces. Legacy JSON enabling these features is rejected. Adding a memory EX unit does not automatically provide memory ordering.')}</p></div>
    </details>
    <details className="studio-guide-section">
      <summary>{text('4. 통합 검증', '4. Integration verification')}</summary>
      <div className="studio-guide-body"><p>{text('SOURCE_VERSION.json과 설정 JSON을 보관하세요. 내보낸 RTL을 시스템 최상위 모듈에 연결하고 의존 명령, EX 대기, 동시 완료, 분기와 리셋을 시뮬레이션하세요. 화면의 설정 검사는 시스템 동작 검증을 대신하지 않습니다.', 'Keep SOURCE_VERSION.json and settings JSON. Connect the exported RTL in your system top and simulate dependencies, EX stalls, simultaneous completion, branches and reset. Configuration checks do not replace system simulation.')}</p>
        <pre className="studio-guide-code"><code>{`verilator --lint-only -Wno-WIDTH --unroll-count 256 --top-module eulsukdo_example_top RTL/*_top.sv ${config.decoderSource !== 'external' ? 'RTL/*_decoder.sv ' : ''}RTL/eulsukdo_rtl/*.sv`}</code></pre>
      </div>
    </details>
  </section>;
}
