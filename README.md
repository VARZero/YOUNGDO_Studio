# YOUNGDO Studio / 영도 스튜디오

EULSUKDO Gen2와 ORYUKDO Gen3의 구조·ISA·디코더·EX 경로를 설정하고 RTL ZIP을 만드는 웹 생성기입니다.

2026-11-18: 현재 오륙도 Gen3의 실제 포트와 소스 목록으로 생성기를 갱신했습니다. 예전 Gen2 오륙도의 token/epoch·AGU 포트와 호환되지 않으므로 새 ZIP의 `INTEGRATION.md`에 따라 연결하세요. 을숙도 RTL은 최신 버전 그대로 유지합니다.

| 플랫폼 | 원본 커밋 | 소스 | 기본 구성 |
| --- | --- | --- | --- |
| EULSUKDO Gen2 | `9b0e1c6b792b132f05844c3113ff8dfde712cd77` | `gen2/src/RTL`, 9개 | 2D/5I, IST 128, PRF 64, LSQ OFF |
| ORYUKDO Gen3 | `65a06e6595cb1030bdebd363f23249f9ad4650b0` | `rtl/sources_gen3.f`, 20개 | 3D/5I, IST 128/8뱅크, PRF 64, LSQ 32 |

원본 RTL은 수정 없이 동봉합니다. [versions.json](gen/platforms/versions.json)에 커밋, 원래 경로, 파일별 SHA-256을 기록하며 같은 정보가 ZIP의 `SOURCE_VERSION.json`에 들어갑니다. 선택한 플랫폼의 소스만 내보냅니다. GitHub Pages도 이 고정 버전을 재현합니다.

오륙도 최상위 `oryukdo_example_top`은 `oryukdo_gen3_scheduler`를 연결합니다. 생성 디코더는 `i_im_recv_inst`, 외부 디코더는 `i_nel_decode_*`를 사용합니다. 완료는 Flow ID + PC 태그와 `i_wbc_result_*`이며, 외부 RF 쓰기는 `o_wbc_accept`로 허가된 레인만 수행합니다. 복구·예외·트랩·부작용 확정 및 외부 예측기 포트를 모두 노출합니다. 커밋 폭은 디코드 폭을 따릅니다.

오륙도 LSQ는 복구 가능한 두 FIFO 순서 게이트이며, AGU와 메모리 버스는 EX에서 연결합니다. `lsqEntries`는 IST 크기와 독립적입니다. **사용자 LSQ RTL**을 선택하면 `RTL/custom_lsq/oryukdo_custom_lsq.sv`와 이를 호출하는 파생 스케줄러를 추가합니다. 시작 파일은 현재 내장 LSQ를 호출하며 원본 RTL은 바뀌지 않습니다. CPU 내부 issue/WBC가 BRAM 제어에 연결되는 경우 `asyncPortIsolation=false`를 사용하세요.

ZIP은 완성 CPU가 아닙니다. EX, 데이터 RF, 메모리/MMU, 프런트엔드와 CSR 실행기는 외부 구성요소입니다. 생성 RTL 검증은 사용자 RTL·전체 SoC·FPGA 타이밍 검증을 대신하지 않습니다.

```sh
cd gen/generator-app
npm ci
npm run dev
# 검증
npm run lint
npm run build
npm run verify:rtl
npx playwright install --with-deps chromium --only-shell
npm run verify:auto
```

`verify:rtl`은 을숙도 10개, 오륙도 8개 구성의 포트·파라미터·소스 해시·ZIP을 검사합니다. Gen3 검사는 Verilator 경고도 실패로 처리합니다. 을숙도의 기존 `UNOPTFLAT` 경고는 로그에 남깁니다. 생성 디코더의 실제 명령어 해석과 Gen3 생성 wrapper를 통한 내장/사용자 LSQ × 정적/외부 예측기 시뮬레이션, warm reset, 장기 실행, 예외·복구 충돌, 체크포인트 및 프로토콜 회귀 검사를 포함합니다. Windows에서는 WSL의 Verilator를 자동 사용합니다.

`verify:auto`는 Pages와 같은 하위 경로에서 일반 Studio와 자동 생성의 ZIP 일치, 사용자 LSQ, 외부 디코더·예측기, 설정 저장·불러오기, 개별 파일, 오류 처리, 데스크톱·모바일 레이아웃을 검사합니다. 검사 로그는 로컬 `gen/generator-app/verification/`에 생성됩니다.

[사용설명서](gen/generator-app/USER_GUIDE.md) · [플랫폼 동기화](gen/platforms/README.md) · [Gen3 예제 JSON](gen/generator-app/examples/oryukdo_gen3_3d5i.json)

[Studio 열기](https://varzero.github.io/YOUNGDO_Studio/) · [에이전트 자동 생성](https://varzero.github.io/YOUNGDO_Studio/auto_create/)

자동 생성은 `auto_create/?config=<URL 인코딩 JSON>` 또는 `#config=...`, 입력란·파일 업로드를 지원합니다. `#auto-create-status[data-state="ready"]` 이후 `#generated-manifest.textContent`에서 파일 목록을 읽고 `#download-zip`으로 저장하세요. 오류는 `#generation-error`에 표시됩니다. 개별 파일 페이지도 완료 표시 후 `#generated-file.textContent`를 읽습니다. JavaScript를 실행하는 브라우저가 필요합니다.
