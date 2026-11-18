# YOUNGDO Studio 사용설명서

EULSUKDO Gen2와 ORYUKDO Gen3를 구성합니다. 기본값은 **2d5i, IST 128개, 물리 레지스터 64개, 경로별 RS FIFO 128개**입니다. 경로 순서는 Branch 1개, ALU 3개, Memory 1개입니다. 을숙도의 **LSQ는 선택형이며 기본 OFF**입니다.

## 오륙도 Gen3 선택 시

기본 3D/5I, IST 128개, 물리 레지스터 64개, LSQ 32개입니다. PRM 대기 슬롯 4, 반환 폭 4이며 IST 뱅크는 자동 또는 직접 지정할 수 있습니다. 커밋 폭은 디코드 폭이며 윈도 크기는 이 폭 이상이어야 합니다.

- 생성 디코더 입력은 `i_im_recv_inst`, 외부 디코더는 `i_nel_decode_*`입니다. 인출 요청의 Flow ID + PC를 그대로 반환하고 `o_im_recv_inst_get`까지 유지합니다.
- EX 완료는 `i_wbc_result_valid/data` 펄스입니다. RF 쓰기는 `o_wbc_accept`로 허가된 레인만 수행합니다. 예외는 `i_exception_*`, 복구는 `o_backend_kill_*`, Store/CSR/MMIO 확정은 sidefx handshake를 사용합니다.
- LSQ는 복구 가능한 두 FIFO 순서 게이트입니다. AGU와 메모리 버스는 EX 외부 구성요소입니다. Store 전달 엔진을 포함하지 않습니다. LSQ는 항상 켜며 경로와 깊이(기본 32)를 지정합니다.
- 사용자 LSQ를 선택하면 `RTL/custom_lsq/oryukdo_custom_lsq.sv`와 이를 호출하는 파생 스케줄러가 추가됩니다. 시작 파일은 현재 내장 LSQ를 호출하며 `lsqEntries`를 따릅니다. 원본 20개 RTL은 변경하지 않습니다.
- 외부 예측기는 query의 Flow ID + PC 태그에 맞는 response를 반환합니다. 정적 fallback은 없습니다.
- CPU 내부 BRAM 제어 경로와 연결할 때는 비동기 포트 격리를 해제(`asyncPortIsolation=false`)하세요. 독립 모듈의 기본값은 true입니다.
- Gen2 오륙도 ZIP과 포트 호환되지 않습니다. 설정 JSON을 다시 내보내고 새 `INTEGRATION.md`에 따라 연결하세요. 완성 CPU나 사용자 EX의 검증 결과를 의미하지 않습니다.

## 실행과 화면

`gen/generator-app`에서 `npm ci`, `npm run dev` 후 표시되는 주소를 여세요. 한국어·English 전환은 화면 언어만 바꿉니다.

| 메뉴 | 내용 |
| --- | --- |
| 아키텍처 | 디코드 폭, IST·물리 레지스터 수, RS FIFO 엔트리, IST 발행 폭·SRAM 뱅크 |
| 디코더 / ISA | 생성 디코더 또는 외부 디코더 선택, 명령어 형식·즉시값·micro-op·EX 경로 매핑 |
| EX 모듈 | 실행 경로 순서·이름·실행 유닛 수, 발행·WBC 레인 |
| 검증 / 내보내기 | 설정 오류, RTL 미리보기, ZIP 생성, 플랫폼별 연결 안내 |

IST 발행 폭을 비우면 EX 유닛 수를 따릅니다. IST 뱅크 수를 비우면 `max(디코드 폭, IST 발행 폭)` 이상의 최소 2의 거듭제곱이 됩니다. 뱅크 수를 직접 지정하면 디코드 폭 이상인 2의 거듭제곱이어야 합니다. RS FIFO 엔트리는 `STRUCT_RS_FIFO_WIDTH`이며 경로별 최소 명령어 수입니다. FIFO 행 반올림과 입출력 버퍼 때문에 실제 저장 공간은 더 클 수 있습니다.

설정값은 JSON에 보존됩니다. 기존 을숙도 JSON은 신규 설정이 없어도 자동 기본값으로 불러올 수 있습니다. LSQ가 활성화된 JSON은 경로와 깊이가 유효하면 불러옵니다. 오륙도 JSON도 현재 Gen3 제약에 맞으면 불러옵니다. PRM 갱신 폭 등 기존 JSON 파라미터도 그대로 전달합니다.

## 선택형 LSQ

아키텍처 화면에서 **LSQ 켜기**를 선택하고 메모리 EX 경로와 엔트리 수를 지정합니다.

| JSON 설정 | 기본값 | 생성 RTL |
| --- | --- | --- |
| `enableMemoryOrder` | `false` | `ENABLE_LSQ` |
| `lsqEntries` | `32` | `STRUCT_LSQ_ENTRIES` |
| `memoryCoreId` | 기본 화면의 Memory 경로 ID | 선택한 경로의 인덱스 → `STRUCT_LSQ_EX_PATH` |

LSQ를 켤 때 `memoryCoreId`는 실제 경로 ID여야 하며 깊이는 디코드 폭 이상이어야 합니다.
경로를 위아래로 이동하면 같은 ID를 따라 새 경로 인덱스를 전달합니다. WBC 레인 번호와 다릅니다.
복수 실행 레인도 지원하지만 선택한 경로의 모든 명령을 합쳐 한 번에 하나만 실행합니다.
위·아래 FIFO는 각각 지정한 깊이를 가지며, Flow Window + 전체 PC로 비교합니다.

LSQ는 RS에서 준비된 명령을 받아 원래 NEL→IST 접수 순서대로 EX에 보내고, 완료 후 다음 명령을 시작합니다.
주소 계산과 실제 메모리 접근은 EX에서 연결합니다. **Store도 rd=0과 원래 태그로 WBC 완료를 반환해야 합니다.**
Store를 단순 버퍼에 넣은 시점이 아니라 다음 메모리 명령을 시작해도 되는 시점에 완료를 보내야 합니다.
주소 검색, Store-to-Load forwarding, 오륙도 복구·분기예측 기능은 포함하지 않습니다.

## 상세 구조 파라미터

아키텍처 화면의 **상세 구조 파라미터 · PRM / FCL**을 펼치면 다음을 조절할 수 있습니다. 각 항목에는 RTL 이름과 크기를 변경했을 때의 영향이 표시됩니다.

| RTL 파라미터 | 기본값 | 의미 |
| --- | --- | --- |
| `STRUCT_PRM_ENTRY_BUFFER` | 4 | PHYREG 하나당 대기 등록 슬롯 수. 초과 입력 버퍼의 깊이가 아님 |
| `STRUCT_PRM_ENTRY_UPDATE` | 5 | 사이클당 PRM → IST 준비 완료 통지 수 |
| `STRUCT_UNALLOCATE_PHYREG` | 4 | 사이클당 FCL → PRM 물리 레지스터 반환 수 |
| `STRUCT_FLOW_WINDOWS` | 8 | FCL이 추적하는 Flow 윈도 수 |
| `STRUCT_FLOW_PC_MAX_RANGE` | 16 | 윈도 하나당 최대 명령 수. 바이트 수가 아님 |

변경한 값은 JSON 저장·불러오기와 생성 RTL에 반영됩니다. 예전 JSON에 `flowPcMaxRange`가 없으면 16을 사용합니다. 기본값 복원은 이 다섯 항목만 바꿉니다. 0·음수·소수 등 잘못된 값은 ZIP 생성을 차단합니다. 현재 생성기는 Flow 윈도 수를 2 이상으로 제한합니다.

## 생성 결과

ZIP에는 설정 JSON, 플랫폼별 연결 모듈(`eulsukdo_example_top` 또는 `oryukdo_example_top`), 선택한 경우 생성 디코더, 원본 RTL과 `SOURCE_VERSION.json`이 들어갑니다. 을숙도는 Gen2 RTL 9개, 오륙도는 Gen3 manifest의 RTL 20개이며 사용자 LSQ를 선택하면 파생 파일 두 개도 추가됩니다. 을숙도 LSQ OFF에서도 소스 파일은 동봉되며 RTL generate 조건으로 회로가 제외됩니다. 외부 디코더 모드에서는 `i_nel_decode_*` 입력을 노출하고 생성 디코더 파일은 포함하지 않습니다. `RTL/ex_rtl/`은 사용자 EX를 위한 빈 폴더입니다.

EX는 `valid && get`에서 명령을 수락합니다. EX 패킷의 하위 필드부터 `{Flow ID, PC}` 키, EX 경로, micro-op, 즉시값, 목적 물리 레지스터, 소스 물리 레지스터가 이어집니다. 키의 최하위 비트는 PC입니다.

일반 완료 데이터는 `{목적 물리 레지스터, Flow ID, PC}`이며 연산값 자체는 외부 데이터 레지스터 파일에 기록합니다. 분기 완료는 `{실제 다음 PC, 원래 Flow ID, 원래 PC}`이고 일반 완료도 별도로 보고합니다. 이전 버전의 분기 플래그 묶음과 다릅니다.

기본 ADD/SUB/LW는 예시이며 완성 RV32I 구현이 아닙니다. EX, 메모리, 데이터 레지스터 파일을 연결하고 의존 명령·버퍼 포화·동시 완료·분기·리셋을 시스템 수준에서 검증하세요. 오륙도 ZIP은 복구·예측 인터페이스와 `INTEGRATION.md`를 포함합니다.

## 검증

`npm run lint`, `npm run build`, `npm run verify:rtl`을 사용합니다. RTL 검증은 Windows에서는 WSL Verilator를, Linux에서는 PATH의 Verilator를 사용합니다. 기존 원본 PRM의 `UNOPTFLAT` 경고는 `verification/` 로그에 남으며, 검사가 통과해도 경고가 없다는 뜻은 아닙니다. 소스 해시·파라미터 연결·ZIP 내용·차단 기능을 함께 검사합니다.
