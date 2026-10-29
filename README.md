# YOUNGDO Studio / 영도 스튜디오

2026-10-29: 오륙도 frontier의 분기·인터럽트 경계 실행 허가와 XSim 접수 신호
수정을 반영했습니다. 일반 Studio와 `auto_create/`의 ZIP에 같은 수정본이 포함됩니다.
원인과 검증 범위는 [업스트림 수정 기록](https://github.com/VARZero/ORYUKDO/blob/84e07b64b525b9d243b74641a1e59bb1337f4f52/docs/FRONTIER_BOUNDARY_FIX.md)을 참고하세요.
공개 포트·설정 형식은 유지하며, 이번 수정의 FPGA 배치·배선은 재검증하지 않았습니다.

EULSUKDO와 ORYUKDO Gen2의 구조·ISA·디코더·EX 경로를 설정하고 RTL ZIP을 만드는 웹 생성기입니다. 을숙도는 **두 FIFO 방식의 선택형 LSQ**를 지원하며 기본 OFF입니다. 오륙도는 복구 가능한 rename, 정확한 예외, 윈도우 경계 인터럽트, 내부 Store 전달과 순차 외부 공개를 포함합니다.

소스는 각 저장소의 `gen2/src/RTL`이며 [소스 버전](gen/platforms/versions.json)에 커밋과 파일별 SHA-256을 기록합니다. 을숙도 `9b0e1c6b792b132f05844c3113ff8dfde712cd77`의 9개 파일은 유지하고, 오륙도 `84e07b64b525b9d243b74641a1e59bb1337f4f52`의 17개 파일을 수정 없이 추가했습니다. 선택한 플랫폼의 소스와 버전만 ZIP에 들어갑니다.

오륙도의 최상위는 `oryukdo_example_top`입니다. 정적 예측은 다음 순차 PC를 사용하고, 외부 모드는 커스텀 예측기 응답을 기다리며 정적 fallback은 없습니다. 생성 디코더 모드의 입력은 `i_instruction`이며, **Store/CSR 구분·윈도우 끝·인출 오류는 프런트엔드에서 제공**합니다. 외부 디코더 모드에서는 모든 `i_decode_*`를 직접 제공합니다. EX, 데이터 레지스터 파일, MMU, CSR 실행기와 프런트엔드는 외부 구성요소입니다.

오륙도의 **내장 LSQ는 기본값으로 유지**합니다. `LSQ 구현 선택 → 사용자 LSQ RTL` 또는 JSON의 `lsqMode="custom"`을 선택하면 `CUSTOM_LSQ=1`과 `RTL/custom_lsq/oryukdo_custom_lsq.sv`를 내보냅니다. 시작 파일 내부를 수정하거나 자신이 만든 모듈을 연결하세요. 시작 파일은 교체 전까지 내장 동작을 사용합니다. 접수 정체·완료·Store 공개·복구 계약은 ZIP의 `INTEGRATION.md`에 포함됩니다.

```sh
cd gen/generator-app
npm ci
npm run dev
# 검증
npm run lint
npm run build
npm run verify:rtl
```

Windows의 RTL 검증은 WSL의 Verilator를 자동 사용합니다. Linux에서는 PATH의 Verilator를 사용합니다. `verify:rtl`은 을숙도 10개·오륙도 8개 구성의 연결, 파라미터, ZIP 및 소스 해시를 검사합니다. 오륙도는 생성 디코더의 분류·예외 우선순위와 5개 스케줄러 조합을 시뮬레이션합니다. 내장/사용자 LSQ × 정적/외부 예측기 4개 조합 및 내보낸 시작 파일의 실제 동작을 포함하며, 복구·메모리·CSR·Ready 및 사용자 LSQ 입력/AGU 정체를 검증합니다. 원본의 `UNOPTFLAT` 경고는 `gen/generator-app/verification/`에 보존하며, 그 외 활성화된 경고 및 오류는 검사를 실패시킵니다. 사용자 EX와 보드 통합 및 클럭 검증은 별도입니다. 기존 70 MHz 수치는 `844267f`의 기록이며 이번 옵션 추가 후 새로 배치·배선한 수치가 아닙니다.

소스 교체는 [플랫폼 안내](gen/platforms/README.md), 화면 사용법은 [사용설명서](gen/generator-app/USER_GUIDE.md)를 참고하세요. GitHub Pages 빌드는 동봉된 커밋을 사용하므로 원격의 예전 `main`으로 되돌아가지 않습니다. 새 소스 반영은 명시적인 동기화와 검증 후 진행합니다.

GitHub Pages 배포 주소: https://varzero.github.io/YOUNGDO_Studio/

에이전트 자동 생성: https://varzero.github.io/YOUNGDO_Studio/auto_create/

해당 페이지의 **JSON 필드 설명**에 설정의 모든 하위 필드, 필수 여부·타입·생략 시 기본값, RTL 파라미터 매핑, ID 참조, 즉시값 조립과 명령 판별 우선순위를 설명합니다.

JavaScript를 실행하는 브라우저로 `auto_create/?config=<URL 인코딩한 Studio JSON>`에 접속하면 설정에 맞는 RTL과 ZIP을 생성합니다. `#config=...` 또는 페이지의 JSON 입력란/파일 선택도 지원합니다. `#auto-create-status`의 `data-state`가 `ready`가 되면 `#generated-manifest`의 `textContent`에서 파일 목록을 읽거나 `#download-zip`을 클릭하세요. `error`이면 `#generation-error`를 읽습니다. 개별 파일은 목록의 URL을 열고 같은 완료 표시를 기다린 다음 `#generated-file.textContent`를 UTF-8로 저장합니다. 자세한 에이전트 프롬프트는 해당 페이지에 있습니다. 일반 HTTP GET만으로는 JS 실행 후 결과를 받을 수 없습니다.

브라우저 검증은 `gen/generator-app`에서 `npx playwright install --with-deps chromium --only-shell` 후 `npm run verify:auto`로 실행합니다. GitHub Pages와 같은 하위 경로로 빌드하여 정적 서버에서 주소 입력·개별 파일·ZIP·오류 처리·Studio 출력 일치를 검사합니다.

ZIP은 완성 CPU가 아닙니다. 을숙도의 선택형 LSQ를 켜면 Store도 다음 메모리 명령을 시작해도 되는 시점에 rd=0과 원래 Flow Window + PC로 완료를 반환해야 합니다. 오륙도는 메모리 순서 처리를 항상 포함하며, 메모리 EX가 원래 token과 주소·데이터·MMU 결과를 AGU 인터페이스로 반환합니다. 오륙도의 RF 쓰기는 `o_result_accept`가 아닌 `o_wb_valid` 기준입니다.

이 커밋의 을숙도 2d5i/LSQ 32엔트리 구성은 Zynq-7020 스케줄러 OOC 합성·배선에서 70MHz를 통과했습니다. 해당 결과는 사용자 설정 전체나 보드 전체의 클럭을 보장하지 않습니다. 자세한 수치는 원본 저장소의 `GEN2_LSQ_FPGA_TIMING.md`에 있습니다.
