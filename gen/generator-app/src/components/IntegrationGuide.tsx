import type { Language } from '../utils/locale';
import type { SchedulerConfig } from '../utils/rtlGenerator';

interface IntegrationGuideProps {
  language: Language;
  config: SchedulerConfig;
}

// Port contracts are based on the bundled scheduler, memory_order_queue and predictor RTL.
export function IntegrationGuide({ language, config }: IntegrationGuideProps) {
  const text = (ko: string, en: string) => language === 'ko' ? ko : en;
  const oryukdo = config.platform === 'oryukdo';
  const platform = oryukdo ? 'oryukdo' : 'eulsukdo';
  const lanes = config.coresList.map((core, index) => {
    const start = config.coresList.slice(0, index).reduce((sum, entry) => sum + entry.count, 0);
    return { ...core, start, end: start + core.count - 1 };
  });
  const memoryLane = lanes.find(core => core.id === config.memoryCoreId);

  const issueExample = `// lane = EX lane number; W = _BITWIDTH_EX_INST_WIDTH
wire [W-1:0] ex_packet = o_rs_entry_data[lane*W +: W];
wire issue_fire = o_rs_entry_valid[lane] && i_rs_entry_get[lane];
// Packet, MSB -> LSB:
// {source_phyregs, dest_phyreg, immediate, microop, expath, flow_pc_key}
// Save the packet${oryukdo ? ' and o_rs_entry_age[lane*RECOVERY_AGE_WIDTH +: RECOVERY_AGE_WIDTH]' : ''} on issue_fire.

// Completion metadata, MSB -> LSB:
// i_wbc_result_data[lane*R +: R] = {saved_dest_phyreg, saved_flow_pc_key};
// R = _BITWIDTH_EX_RESULT_WIDTH; arithmetic result goes to your physical register file.
${oryukdo ? '// Return the saved age on i_wbc_result_age.\n// Write the physical register only when result_valid && o_wbc_result_accept[lane].' : '// Write the physical register when publishing the completion on i_wbc_result_valid.'}`;

  return <section className="studio-integration-guide" aria-labelledby="integration-guide-title">
    <div className="studio-section-heading"><div>
      <span className="studio-eyebrow">{text('내보낸 다음', 'AFTER EXPORT')}</span>
      <h2 id="integration-guide-title">{text('이제부터 무엇을 해야 하나요?', 'What should I do next?')}</h2>
    </div></div>
    <p>{text('ZIP을 풀고, 아래 순서로 실행 유닛과 메모리·분기예측기를 연결하세요. 생성된 최상위 모듈은 스케줄러와 디코더를 연결하는 출발점입니다. 실제 연산부, 데이터용 물리 레지스터 파일, 메모리와 CSR은 사용자 프로젝트에서 구현합니다.', 'Extract the ZIP and connect execution units, memory and prediction using the steps below. The generated top connects the scheduler and decoder. Your project supplies the execution datapath, physical register data file, memory and CSR.')}</p>
    <ol className="studio-guide-start">
      <li>{text('설정 JSON과 SOURCE_VERSION.json을 보관하고, 선택한 플랫폼의 RTL을 빌드 목록에 추가합니다.', 'Keep the settings JSON and SOURCE_VERSION.json, and add the selected platform RTL to your build.')}</li>
      <li>{text('EX를 RTL/ex_rtl/에 작성하고, 별도의 시스템 최상위 모듈에서 eulsukdo_example_top과 연결합니다. 폴더에 파일을 넣는 것만으로 자동 연결되지는 않습니다.', 'Implement EX modules in RTL/ex_rtl/ and instantiate them alongside eulsukdo_example_top in your system top. Placing files in the folder does not connect them automatically.')}</li>
      <li>{text('클록·리셋, 명령어 메모리, EX와 레지스터 파일을 먼저 검증한 뒤 LSQ와 복구·분기예측을 통합합니다.', 'Verify clock/reset, instruction memory, EX and the register file first; then integrate the LSQ, recovery and prediction.')}</li>
    </ol>

    <details open className="studio-guide-section">
      <summary>{text('1. EX 실행 유닛 만들고 연결하기', '1. Implement and connect EX units')}</summary>
      <div className="studio-guide-body">
        <p>{text('디코더의 microop 값과 EX 경로 매핑을 기준으로 ALU·분기·메모리 AGU를 구현하세요. EX 입력의 rs/rd는 물리 레지스터 번호이며 실제 피연산자 값이 아닙니다. 소스 번호로 데이터 레지스터 파일을 읽고, 완료 시 목적 레지스터에 연산값을 기록해야 합니다.', 'Implement ALU, branch and memory AGU operations from the decoder microop values and EX path mapping. EX rs/rd fields are physical register identifiers, not operand values. Read your data register file using source identifiers and write the operation result to the destination on completion.')}</p>
        <div className="studio-table-wrap"><table><thead><tr><th>{text('현재 EX 경로', 'Current EX path')}</th><th>{text('발행 / WBC 레인', 'Issue / WBC lanes')}</th></tr></thead><tbody>
          {lanes.map(core => <tr key={core.id}><td>{core.name}</td><td>{core.start === core.end ? core.start : `${core.start}–${core.end}`}{config.enableMemoryOrder && core.id === config.memoryCoreId ? text(' · LSQ 완료 전용', ' · LSQ completion reserved') : ''}</td></tr>)}
        </tbody></table></div>
        <ul>
          <li><code>o_rs_entry_valid / i_rs_entry_get / o_rs_entry_data</code>: {text('valid와 get이 동시에 1인 클록 에지에서 명령어를 한 번 수락합니다. 내부 버퍼가 가득 차면 get을 0으로 내려 대기시킵니다.', 'Accept one instruction at a clock edge with both valid and get high. Deassert get when your internal buffer is full.')}</li>
          <li><code>o_rs_entry_data[lane*W +: W]</code>: {text('한 레인의 패킷을 추출합니다. W는 _BITWIDTH_EX_INST_WIDTH입니다. 하위 비트부터 flow+PC 키, 경로 번호, microop, 즉시값, 목적 물리 레지스터, 소스 물리 레지스터 순서입니다. 필드 폭은 생성 top의 localparam을 사용하세요.', 'Extract one lane with W = _BITWIDTH_EX_INST_WIDTH. From LSB upward: flow+PC key, path, microop, immediate, destination physical register, source physical registers. Use the generated top localparams for field widths.')}</li>
          <li><code>i_wbc_result_valid / i_wbc_result_data</code>: {text('데이터는 {목적 물리 레지스터, flow+PC 키}입니다. ALU 연산값을 이 버스에 넣지 마세요. 완료 메타데이터와 실제 레지스터 쓰기가 같은 명령어를 가리키도록 맞춥니다. 한 레인에 여러 유닛을 연결하면 결과 중재가 필요합니다.', 'Data is {destination physical register, flow+PC key}, not the ALU value. Match completion metadata to the actual register write. Arbitrate if multiple units share a result lane.')}</li>
          {oryukdo && <li><code>o_rs_entry_age / i_wbc_result_age / o_wbc_result_accept</code>: {text('수락한 명령어의 age를 저장했다가 그대로 반환합니다. accept는 살아 있는 명령어의 결과인지 판정하는 신호이며 ready/재시도 신호가 아닙니다. valid가 1인 완료에서 accept가 0이면 레지스터 쓰기와 외부 부작용을 억제하고 폐기하세요. accept를 기다리며 같은 결과를 무한 재전송하지 마세요.', 'Save and return the issued age unchanged. accept indicates whether a completion belongs to a live instruction; it is not a ready/retry handshake. Discard a valid completion with accept low and suppress register writes and side effects; do not retry it indefinitely.')}</li>}
          {oryukdo && <li><code>o_recovery_flush / o_recovery_flush_age</code>: {text('플러시가 발생하면 더 큰 age의 대기·실행 결과를 무효화합니다. 장시간 연산도 이전 age를 보존해 늦게 도착한 결과가 재사용된 레지스터를 덮어쓰지 않게 하세요.', 'On flush, invalidate pending/executing work with greater age. Preserve age through long-latency operations so late results cannot overwrite reused registers.')}</li>}
          <li><code>i_wbc_result_branch_valid / i_wbc_result_branch_data</code>: {text('분기 결과 형식은 {jump, jump_reg, branch, 새 PC}입니다. 현재 생성기는 분기 결과 포트가 1개이므로 여러 분기 유닛을 사용하면 중재하세요.', 'Branch metadata is {jump, jump_reg, branch, new PC}. The generator currently provides one branch result port; arbitrate multiple branch units.')}</li>
          {oryukdo && <li><code>i_recovery_resolve_* / i_recovery_taken / i_recovery_target</code>: {text('분기 EX에서 원래 키·age와 실제 분기 여부·목적 PC를 보고합니다. i_recovery_fault_*는 예외 명령어의 키·age·원인을 전달합니다. 예측·복구와 기존 분기 결과 경로가 서로 다른 명령어를 보고하지 않도록 맞추세요.', 'Report the original key/age and actual branch direction/target from branch EX. Use i_recovery_fault_* for fault key, age and cause. Keep recovery and the legacy branch result path aligned to the same instruction.')}</li>}
        </ul>
        <pre className="studio-guide-code"><code>{issueExample}</code></pre>
      </div>
    </details>

    <details className="studio-guide-section">
      <summary>{text('2. 기본 LSQ 연결과 커스텀 LSQ 교체', '2. Connect the built-in LSQ or replace it')}</summary>
      <div className="studio-guide-body">
        <p>{config.enableMemoryOrder
          ? text(`현재 LSQ가 켜져 있습니다. ${memoryLane?.name ?? '선택한 메모리 경로'}의 WBC 레인 ${memoryLane?.start ?? '미지정'}은 LSQ 완료에 사용됩니다. 이 경로는 실행 유닛 1개만 지원합니다.`, `LSQ is enabled. WBC lane ${memoryLane?.start ?? 'not selected'} of ${memoryLane?.name ?? 'the selected memory path'} is reserved for LSQ completion. This path supports one execution unit.`)
          : text('현재 LSQ가 꺼져 있습니다. 기본 LSQ를 사용하거나 내부 모듈을 교체하려면 아키텍처에서 메모리 순서 제어를 켜고 실행 유닛이 1개인 메모리 EX 경로를 선택한 뒤 다시 내보내세요.', 'LSQ is disabled. To use or replace the internal LSQ, enable memory ordering, select a memory EX path with one unit, then export again.')}</p>
        <ol>
          <li>{text('AGU가 주소, 스토어 데이터, 바이트 마스크를 계산하고 i_mem_agu_valid/key/payload로 전달합니다. valid와 o_mem_agu_get이 함께 1일 때만 전달을 완료하고, 대기 중에는 키와 payload를 유지합니다.', 'Have the AGU compute address, store data and byte mask and send i_mem_agu_valid/key/payload. Transfer only with valid and o_mem_agu_get high; keep key and payload stable while stalled.')}{oryukdo && text(' i_mem_agu_age도 발행 시 받은 age를 그대로 전달합니다.', ' Return the original issued age on i_mem_agu_age as well.')}</li>
          <li>{text('메모리 어댑터는 o_mem_req_valid/key/payload를 받아 i_mem_req_get으로 수락합니다. payload의 상위→하위 순서는 {is_store, address, store_data, byte_mask, dest_phyreg, microop}입니다. 현재 주소·데이터 폭은 IS_INST_PC_BITWIDTH, 마스크 폭은 그 값/8입니다.', 'The memory adapter accepts o_mem_req_valid/key/payload with i_mem_req_get. Payload MSB→LSB: {is_store, address, store_data, byte_mask, dest_phyreg, microop}. Address/data width is currently IS_INST_PC_BITWIDTH and mask width is that value divided by 8.')}</li>
          <li>{text('응답은 i_mem_resp_valid/data와 o_mem_resp_ready로 전달합니다. 스토어도 완료 응답이 필요합니다. 기본 LSQ는 동시에 하나의 메모리 요청만 진행하며 응답에 요청 ID가 없습니다. 로드 폭·부호 확장과 버스 프로토콜 변환은 메모리 어댑터에서 처리하세요.', 'Return responses through i_mem_resp_valid/data and o_mem_resp_ready. Stores also need completion responses. The built-in LSQ allows one outstanding request and has no response ID. Handle load width/sign extension and bus protocol conversion in your memory adapter.')}</li>
          <li><code>o_mem_complete_valid/key/rd/data</code>: {text('로드 완료 데이터는 별도의 데이터 레지스터 파일에 기록합니다. 메모리 WBC 메타데이터는 스케줄러가 내부에서 만들어 주므로 같은 완료를 외부 WBC로 다시 보내지 마세요. 스토어는 레지스터에 기록하지 않습니다.', 'Write load completion data to your data register file. The scheduler constructs memory WBC metadata internally; do not report the same completion again through external WBC. Stores do not write a register.')}</li>
        </ol>
        {oryukdo && <p className="studio-guide-callout">{text('오륙도에서는 내부 커밋 경계가 스토어 실행을 승인합니다. ENABLE_RECOVERY_TRACKING이 켜진 상태에서는 외부 i_store_commit_* 입력 대신 내부 승인 신호를 사용합니다. 플러시된 로드의 응답은 소비하되 완료·레지스터 쓰기는 발생시키지 않아야 합니다.', 'ORYUKDO grants stores from its internal commit frontier. With ENABLE_RECOVERY_TRACKING enabled, internal grants override external i_store_commit_* inputs. Consume responses for flushed loads without generating completion or register writes.')}</p>}
        <h3>{text('직접 만든 LSQ를 쓰려면', 'Using your own LSQ')}</h3>
        <p>{text('웹앱에는 커스텀 LSQ 파일 업로드 기능이 없습니다. ZIP을 푼 뒤 아래 파일을 사용자 프로젝트에서 교체하세요. 같은 module 이름, 파라미터, 포트 형식을 유지하면 스케줄러 인스턴스를 그대로 사용할 수 있습니다. 인터페이스를 바꾸면 eulsukdo_scheduler.sv의 U_MEMORY_ORDER_QUEUE 연결과 완료·복구 배선도 수정해야 합니다.', 'The app has no custom LSQ upload. Replace the file below in your extracted project. Preserve its module name, parameters and ports to keep the scheduler instance compatible. Interface changes also require edits to U_MEMORY_ORDER_QUEUE and completion/recovery wiring in eulsukdo_scheduler.sv.')}</p>
        <code className="studio-guide-file">RTL/{platform}_rtl/memory_order_queue.sv</code>
        <ul>
          <li>{text('i_nel_valid/data로 메모리 명령어의 프로그램 순서를 먼저 등록하고, o_nel_ready로 디코드 묶음 전체를 수용할 공간을 보장하세요. AGU 도착 순서만으로 메모리 순서를 결정하면 안 됩니다.', 'Register program order from i_nel_valid/data before AGU results arrive. Use o_nel_ready to guarantee capacity for an entire decode bundle; AGU arrival order is not program order.')}</li>
          <li>{oryukdo ? text('i_nel_age, i_agu_age, i_flush_valid/age와 i_store_commit_valid/key를 보존하세요. 후속 명령어는 플러시하고, 승인된 정확한 키의 스토어만 외부 메모리에 반영하며 o_mem_complete_store도 연결해야 합니다.', 'Preserve i_nel_age, i_agu_age, i_flush_valid/age and i_store_commit_valid/key. Flush younger work, expose only the exactly granted store to memory, and connect o_mem_complete_store.') : text('을숙도 LSQ는 키와 메모리 명령 순서 기반입니다. 오륙도의 age·복구·스토어 커밋 포트를 그대로 복사하지 말고 선택한 플랫폼의 모듈 선언에 맞추세요.', 'EULSUKDO uses keys and memory order. Match its module declaration rather than copying ORYUKDO age, recovery and store commit ports.')}</li>
          <li>{text('여러 요청을 동시에 처리하거나 비순차 응답을 받으려면 요청 ID와 응답 매칭을 새로 설계해야 합니다. 레지스터 목적지, 키, age를 잃지 않도록 완료 경로까지 함께 검증하세요.', 'Multiple outstanding requests or out-of-order responses require request IDs and response matching. Verify destination, key and age tracking through completion.')}</li>
        </ul>
      </div>
    </details>

    <details className="studio-guide-section">
      <summary>{text('3. 커스텀 분기예측기 연결', '3. Connect a custom branch predictor')}</summary>
      <div className="studio-guide-body">
        {!oryukdo ? <p>{text('외부 분기예측기 인터페이스는 오륙도에서 제공합니다. 플랫폼을 오륙도로 바꾸고 복구 / CSR에서 외부 인터페이스를 선택한 뒤 다시 내보내세요. 을숙도에서 내보낸 top에는 o_predict_* / i_predict_* 포트가 없습니다.', 'The external predictor interface is available on ORYUKDO. Select ORYUKDO and External interface in Recovery & CSR, then export again. EULSUKDO tops do not expose o_predict_* / i_predict_* ports.')}</p> : <>
          <p>{config.predictorMode === 'external' ? text('현재 외부 예측 모드입니다. 사용자 예측기를 시스템 최상위 모듈에 인스턴스화하고 아래 신호를 연결하세요.', 'External prediction is selected. Instantiate your predictor in the system top and connect the signals below.') : text('현재 기본 정적 예측 모드입니다. 커스텀 예측기를 사용하려면 복구 / CSR에서 외부 인터페이스를 선택한 뒤 다시 내보내세요. 포트를 연결해도 ENABLE_EXTERNAL_PREDICTOR가 꺼져 있으면 기본 예측을 사용합니다.', 'Static prediction is selected. Select External interface in Recovery & CSR and export again. Wiring a predictor is insufficient while ENABLE_EXTERNAL_PREDICTOR is disabled.')}</p>
          <ul>
            <li><code>o_predict_request_valid / o_predict_request_key</code>: {text('분기·점프를 디코딩할 때 발생하는 조회 요청입니다. 키의 하위 IS_INST_PC_BITWIDTH 비트가 PC이고 상위 비트는 플로 ID입니다. 예측 테이블은 PC를 사용하고, 복구 추적에는 전체 키를 보존하세요.', 'A lookup at branch/jump decode, not a generic fetch request. Low IS_INST_PC_BITWIDTH key bits are PC; upper bits identify the flow. Index prediction with PC and preserve the complete key for recovery.')}</li>
            <li><code>i_predict_valid / i_predict_taken / i_predict_target</code>: {text('해당 요청과 같은 사이클에 예측 여부와 목적 PC를 반환합니다. ready나 응답 키가 없으므로 지연 응답을 다음 요청에 사용하면 안 됩니다. 다중 사이클 예측기를 사용하려면 요청 보관·응답 매칭·스톨을 지원하도록 통합 회로를 확장해야 합니다.', 'Return valid, direction and target in the request cycle. There is no ready or response key; a delayed response must not be applied to a later request. A multi-cycle predictor requires added request retention, response matching and stall support.')}</li>
            <li><code>o_predict_update_valid/key/taken/target</code>: {text('유효한 분기 해결 결과로 예측 테이블을 학습합니다. 조회와 갱신은 별도 채널이며 같은 사이클에 함께 발생할 수 있습니다. 키에서 PC를 추출해 BHT·BTB 등의 상태를 갱신하세요.', 'Train your tables from accepted branch resolution. Lookup and update are independent and can occur together. Extract PC from the update key to train BHT/BTB state.')}</li>
            <li><code>o_predict_decision_taken/target</code>: {text('스케줄러가 실제로 선택한 예측입니다. 외부 응답 valid가 0이면 내부 기본 예측기가 분기 안 함을 선택합니다. EX는 원래 키·age와 실제 taken/target을 i_recovery_*로 반환하고, 플러시 시 예측기의 추측 상태도 복구하세요.', 'The actual selected decision. With external valid low, the internal predictor falls back to not taken. EX returns original key/age and actual taken/target on i_recovery_*. Restore speculative predictor state on flush.')}</li>
          </ul>
          <p>{text('간단한 출발점은 static_not_taken_predictor.sv의 조회·갱신 포트 형태입니다. 이 모듈의 예측은 조합 논리이며, 상태가 있는 BHT/BTB로 확장할 때는 클록·리셋과 동시 조회/갱신 규칙을 직접 추가하세요.', 'Use static_not_taken_predictor.sv as a lookup/update interface reference. Its prediction is combinational. Add clock/reset and concurrent lookup/update rules when implementing stateful BHT/BTB tables.')}</p>
        </>}
      </div>
    </details>

    <details className="studio-guide-section">
      <summary>{text('4. 메모리·CSR 연결과 통합 검증', '4. Connect memory/CSR and verify integration')}</summary>
      <div className="studio-guide-body">
        <p><code>o_im_req_pc_valid / i_im_req_pc_get / o_im_req_pc</code> → <code>i_im_recv_inst_valid / o_im_recv_inst_get / i_im_recv_pc / i_im_recv_inst</code>: {text('명령어 메모리 요청과 응답을 연결하고 원래의 flow+PC 키를 응답에 되돌려 주세요. 응답을 수락할 때까지 명령어와 키를 유지합니다. 입력 폭과 레인 수는 생성 top을 기준으로 맞춥니다.', 'Connect instruction memory requests and responses, returning the original flow+PC key. Hold instruction and key until accepted. Match widths and lane counts to the generated top.')}</p>
        {oryukdo && <p><code>i_recovery_interrupt_pending / i_recovery_trap_vector / o_recovery_trap_*</code>: {text('CSR·트랩 제어기와 연결해 EPC·원인을 저장하고 복귀 경로를 구현하세요. 생성 디코더 모드에서도 i_nel_decode_exception_cause는 외부에서 채워야 합니다.', 'Connect CSR/trap control, store EPC/cause and implement return handling. Supply i_nel_decode_exception_cause externally even with a generated decoder.')}</p>}
        <ul>
          <li>{text('먼저 Verilator 등으로 시스템 최상위 모듈을 포함한 문법·폭 검사를 수행합니다. 아래 명령은 생성 RTL만 확인하는 시작점이며 사용자 시스템 연결까지 검증하지는 않습니다.', 'First lint the full system top and check widths with Verilator or equivalent. The command below is a starting point for generated RTL and does not verify your system wiring.')}</li>
          <li>{text('시뮬레이션에서 ADD/SUB, 의존 명령어, 여러 사이클 EX, 버퍼 포화, 동시 완료와 리셋을 검증합니다. 기본 ADD/SUB/LW 설정은 예시이며 전체 RV32I 구현이 아닙니다.', 'Simulate ADD/SUB, dependencies, multi-cycle EX, full buffers, simultaneous completion and reset. Default ADD/SUB/LW settings are examples, not a full RV32I implementation.')}</li>
          <li>{text('LSQ는 역순 AGU 도착, 메모리 지연, 로드·스토어 마스크, 스토어 응답, 큐 포화를 검증합니다.', 'For LSQ, test reverse AGU arrival, memory latency, load/store masks, store acknowledgements and queue saturation.')}</li>
          {oryukdo && <li>{text('예측 성공·실패, 늦게 도착한 EX/로드 응답, age 재사용 방지, 플러시 후 레지스터 쓰기 억제, 잘못된 경로의 스토어 차단, 예외·인터럽트를 검증합니다.', 'Test correct/missed predictions, late EX/load responses, age tracking, suppression of writes after flush, wrong-path store blocking, faults and interrupts.')}</li>}
        </ul>
        <pre className="studio-guide-code"><code>{`# Run from the extracted project directory.
# Replace <project> and <isa> with the exported filenames.
verilator --lint-only -Wno-WIDTH --top-module eulsukdo_example_top \\\n  RTL/<project>_${platform}_top.sv \\\n${config.decoderSource !== 'external' ? '  RTL/<isa>_decoder.sv \\\n' : ''}  RTL/${platform}_rtl/*.sv`}</code></pre>
      </div>
    </details>
  </section>;
}
