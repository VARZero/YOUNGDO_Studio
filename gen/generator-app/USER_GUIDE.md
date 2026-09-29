# YOUNGDO Studio 사용설명서

을숙도와 오륙도의 RTL 생성 웹앱입니다. 기본 화면은 한국어이며 을숙도, 디코드 폭 4, 발행 포트 5개, IST 엔트리 64개로 시작합니다. 상단 **한국어 / English**에서 언어를 바꾸면 같은 기기에서 선택이 유지됩니다. 왼쪽 **플랫폼 선택**에서 을숙도와 오륙도를 전환할 수 있습니다. 언어 선택은 화면 문구에만 적용되며 RTL 식별자와 ZIP의 JSON 형식은 같습니다.

## 실행

```sh
cd gen/generator-app
npm ci
npm run dev
```

표시된 로컬 주소를 브라우저에서 엽니다. 빌드와 RTL 생성 결과 검사는 각각 `npm run build`, `npm run verify:rtl`입니다. RTL 검사에는 Verilator가 필요합니다.

## 화면

| 메뉴 | 설정하거나 확인할 내용 |
| --- | --- |
| 아키텍처 | 플랫폼, 디코드 폭, IST 엔트리 수, 물리 레지스터 수, LSQ, 실행 경로와 레인 배치 |
| 디코더 / ISA | 명령어 입력 방식, ISA 설정, 명령어 형식, 즉시값 구성, 판별 조건, uOp, EX 경로 매핑 |
| EX 모듈 | 실행 경로 추가·삭제·순서·이름·실행 유닛 수와 WBC 레인 |
| 복구 / CSR | 분기·예외 복구, 기본 정적 예측 또는 외부 분기예측기, CSR·트랩 제어 연결 안내 (오륙도) |
| 검증 / 내보내기 | 설정 오류, 최상위 연결 모듈과 RTL 소스 미리보기, ZIP 생성 |

폭은 숫자 입력 또는 `−`/`+` 버튼으로 바꿉니다. EX 경로를 옮기면 경로 번호와 WBC 레인이 순서에 맞춰 다시 배치됩니다. 디코더의 명령 EX 매핑은 경로 ID를 따라갑니다. LSQ를 켜면 메모리 EX 경로를 선택해야 하며 그 경로의 인스턴스 수는 1이어야 합니다. 구조 값은 양의 정수, IST와 물리 레지스터 수는 Decode 폭 이상, 물리 레지스터 수는 논리 레지스터 수 이상이어야 합니다. 오류가 있으면 ZIP 생성이 비활성화됩니다.

오륙도는 생성 top에서 recovery tracking을 켜고, LSQ가 활성화된 경우 store commit gate를 켭니다. 외부 predictor를 선택하면 top의 외부 predictor 인터페이스가 켜집니다. 기본 static-not-taken 모듈은 외부 predictor가 연결되지 않은 경우에도 사용됩니다. 을숙도는 기존 flow 완료 방식을 유지합니다.

기존 **Decoder / ISA** 편집기는 그대로 사용합니다. 기본 ADD/SUB/LW는 예시일 뿐 전체 RV32I가 아닙니다. 더 큰 예시는 `examples/rv32i_4decode_5issue.json`과 `examples/rv32i_3decode_5issue_64p64ist.json`을 Import JSON으로 열 수 있습니다. 분산 immediate 매핑에서는 각 원본 구간과 결과 위치를 지정하고 필요하면 상위 비트 부호 확장을 켭니다.

**Decoder / ISA**의 입력 방식은 둘입니다. **ISA 디코더 생성**은 입력 레인마다 생성 디코더를 인스턴스화하고, **외부 디코드 입력**은 `i_nel_decode_*` 버스를 top 포트로 노출합니다. 후자는 사용자 디코더, 사전 디코드 회로 또는 다른 명령 공급원을 연결할 수 있으며 ZIP에 생성 디코더 파일을 넣지 않습니다. 오륙도에서는 두 방식 모두 `i_nel_decode_exception_cause`를 외부에서 입력합니다.
Decoder 화면은 설정 편집에 집중합니다. 최상위 연결 모듈와 생성 디코더 소스는 **검증 / 내보내기 → 생성 RTL 보기**의 파일 메뉴에서 확인하고, ZIP도 그 화면이나 상단에서 받습니다. 화면이 좁으면 ISA 파라미터와 명령 표가 세로로 놓이고 명령 표만 내부에서 가로 스크롤합니다.

## 내보내기와 통합

**검증 / 내보내기** 화면의 **이제부터 무엇을 해야 하나요?**에서 현재 플랫폼과 설정에 맞춘 연결 안내를 확인할 수 있습니다. EX 입력·완료 포트와 레인 배치, 데이터용 물리 레지스터 파일, 기본 LSQ의 메모리 어댑터 연결, 커스텀 LSQ 교체 위치, 외부 분기예측기의 조회·갱신 타이밍, CSR 연결과 시뮬레이션 항목을 설명합니다. EX, LSQ, 분기예측기, 통합 검증 안내는 각각 펼쳐 읽을 수 있습니다.

상단 **Export JSON**은 프로젝트 설정을 `eulsukdo_cad_config.json`으로 저장하며 **Import JSON**은 이를 다시 불러옵니다. 이전 JSON에 프로파일이 없으면 을숙도, predictor 설정이 없으면 static 모드로 읽습니다. **ZIP 생성**은 선택한 플랫폼에 따라 `(프로젝트명)_eulsukdo_rtl.zip` 또는 `(프로젝트명)_oryukdo_rtl.zip`을 생성합니다. ZIP 안의 설정 파일은 `youngdo_config.json`입니다.

```text
<프로젝트명>/
  youngdo_config.json
  RTL/
    <프로젝트명>_<플랫폼>_top.sv
    <ISA 이름>_decoder.sv        # ISA 디코더 생성 모드에만 포함
    <플랫폼>_rtl/               # 선택한 플랫폼의 RTL과 SOURCE_VERSION.json
    ex_rtl/                     # 사용자 EX 구현 위치
```

ZIP의 top 모듈 이름은 `eulsukdo_example_top`입니다. 이 최상위 연결 모듈이 구조 파라미터와 디코더 출력을 스케줄러에 연결합니다. 실제 EX, CSR/privileged 상태, instruction/data memory와 버스는 외부에서 연결해야 하므로 ZIP만으로 완성 CPU가 되지는 않습니다. 정밀 예외와 interrupt는 scheduler가 제공하는 fault/interrupt 및 redirect 인터페이스에 시스템의 CSR 제어를 연결해야 완성됩니다.

예를 들어 을숙도와 생성 디코더를 선택했다면, 압축을 푼 프로젝트에서 다음과 같이 문법 검사를 할 수 있습니다.

```sh
verilator --lint-only -Wno-WIDTH --top-module eulsukdo_example_top \
  RTL/*_eulsukdo_top.sv RTL/*_decoder.sv RTL/eulsukdo_rtl/*.sv
```

LSQ 포트와 payload는 [LSQ 연결 안내](../LSQ_INTEGRATION.md)를 참조하세요.
