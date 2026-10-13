import type { Language } from '../utils/locale';
import type { SchedulerConfig } from '../utils/rtlGenerator';

type ParameterKey = 'prmBuffer' | 'prmUpdate' | 'unallocatePhyreg' | 'flowWindows' | 'flowPcMaxRange';

const parameters: { key: ParameterKey; rtl: string; initial: number; min: number;
  ko: string; en: string; helpKo: string; helpEn: string }[] = [
  { key: 'prmBuffer', rtl: 'STRUCT_PRM_ENTRY_BUFFER', initial: 4, min: 1,
    ko: '물리 레지스터별 대기 슬롯', en: 'Wait slots per physical register',
    helpKo: '하나의 PHYREG에 등록할 수 있는 대기 항목 수입니다. 늘리면 대기 목록 포화가 줄지만, 전체 PHYREG의 저장 공간과 완료 시 읽는 폭도 커집니다. 초과 입력을 보관하는 버퍼의 깊이는 아닙니다.',
    helpEn: 'Wait registrations per PHYREG. More slots reduce wait-list saturation but increase storage across all PHYREGs and completion read width. This is not the overflow input-buffer depth.' },
  { key: 'prmUpdate', rtl: 'STRUCT_PRM_ENTRY_UPDATE', initial: 5, min: 1,
    ko: 'PRM 준비 완료 통지 폭', en: 'PRM ready notification width',
    helpKo: 'PRM이 IST에 사이클당 전달하는 준비 완료 통지의 최대 개수입니다. IST 명령 발행 폭과 별개이며, 늘리면 IST의 갱신 회로도 커집니다.',
    helpEn: 'Maximum ready notifications sent from PRM to IST per cycle. Independent of IST instruction issue width; increasing it also widens IST update logic.' },
  { key: 'unallocatePhyreg', rtl: 'STRUCT_UNALLOCATE_PHYREG', initial: 4, min: 1,
    ko: '물리 레지스터 반환 폭', en: 'Physical register return width',
    helpKo: 'FCL이 PRM에 사이클당 반환할 수 있는 물리 레지스터 수입니다. 늘리면 반환 처리 폭과 할당기 입력 회로가 커집니다.',
    helpEn: 'Physical registers returned from FCL to PRM per cycle. Increasing this widens return processing and allocator inputs.' },
  { key: 'flowWindows', rtl: 'STRUCT_FLOW_WINDOWS', initial: 8, min: 2,
    ko: 'Flow 윈도 수', en: 'Flow window count',
    helpKo: 'FCL이 추적하는 Flow 윈도 수입니다. 늘리면 추적 공간이 커지고, Flow ID 비트 수가 늘어나는 구간에서는 명령·완료 패킷 폭도 커집니다.',
    helpEn: 'Flow windows tracked by FCL. More windows increase tracking storage; crossing a Flow ID width boundary also widens instruction and completion packets.' },
  { key: 'flowPcMaxRange', rtl: 'STRUCT_FLOW_PC_MAX_RANGE', initial: 16, min: 1,
    ko: 'Flow 윈도당 최대 명령 수', en: 'Maximum instructions per flow window',
    helpKo: '한 Flow 윈도에 담는 최대 명령 수입니다. 바이트 수가 아니며 PC 범위는 이 값 × PC 증가량입니다. 늘리면 윈도별 완료 추적 공간이 커집니다.',
    helpEn: 'Maximum instructions in one flow window, not bytes. Its PC span is this value times the PC step. Increasing it expands per-window completion tracking.' },
];

export function StructureParameters({ language, config, onChange }: {
  language: Language; config: SchedulerConfig; onChange: (config: SchedulerConfig) => void;
}) {
  const ko = language === 'ko';
  return <details className="studio-structure-parameters">
    <summary>{ko ? '상세 구조 파라미터 · PRM / FCL' : 'Detailed structure parameters · PRM / FCL'}</summary>
    <p>{ko ? '값은 설정 JSON과 생성 RTL에 함께 반영됩니다. 기본값 복원은 아래 다섯 항목만 변경합니다.'
      : 'Values are saved in settings JSON and generated RTL. Reset changes only the five fields below.'}</p>
    <div className="studio-parameter-grid">{parameters.map(parameter => <label className="studio-parameter-field" key={parameter.key}>
      <span>{ko ? parameter.ko : parameter.en}</span>
      <code>{parameter.rtl}</code>
      <input type="number" min={parameter.min} step="1" aria-label={parameter.rtl}
        aria-describedby={`help-${parameter.key}`} value={config[parameter.key] ?? parameter.initial}
        onChange={event => onChange({ ...config, [parameter.key]: Number(event.target.value) })} />
      <small id={`help-${parameter.key}`}>{ko ? parameter.helpKo : parameter.helpEn}</small>
    </label>)}</div>
    <button type="button" className="studio-button" onClick={() => onChange({ ...config,
      prmBuffer: 4, prmUpdate: 5, unallocatePhyreg: 4, flowWindows: 8, flowPcMaxRange: 16,
    })}>{ko ? '상세 설정 기본값 복원' : 'Reset detailed settings'}</button>
  </details>;
}
