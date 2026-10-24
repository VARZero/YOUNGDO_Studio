# YOUNGDO Studio / 영도 스튜디오

현재 EULSUKDO Gen2 스케줄러의 구조·ISA·디코더·EX 경로를 설정하고 RTL ZIP을 만드는 웹 생성기입니다. **두 FIFO 방식의 선택형 LSQ**를 지원합니다. LSQ는 기본 OFF이며, ON이면 선택한 메모리 경로를 순서대로 시작하고 완료를 기다립니다. ORYUKDO는 추후 제공입니다.

소스는 `VARZero/EULSUKDO`의 `gen2/src/RTL`입니다. 현재 스냅샷은 `9b0e1c6b792b132f05844c3113ff8dfde712cd77`이며 [소스 버전](gen/platforms/versions.json)에 파일별 SHA-256을 기록합니다. LSQ를 포함한 원본 RTL 9개를 수정 없이 동봉합니다.

```sh
cd gen/generator-app
npm ci
npm run dev
# 검증
npm run lint
npm run build
npm run verify:rtl
```

Windows의 RTL 검증은 WSL의 Verilator를 자동 사용합니다. Linux에서는 PATH의 Verilator를 사용합니다. `verify:rtl`은 10개 구성에서 LSQ ON/OFF, 깊이 1·7·17·32, 메모리 경로 재배치와 복수 레인, 생성·외부 디코더, IST 뱅크·RS FIFO, ZIP 내용과 파라미터 전달을 검사합니다. 원본의 `UNOPTFLAT` 경고는 `gen/generator-app/verification/`에 보존하며, 그 외 활성화된 경고 및 오류는 검사를 실패시킵니다. 이는 생성된 연결의 검사이며 전체 시스템 시뮬레이션이나 합성을 대신하지 않습니다.

소스 교체는 [플랫폼 안내](gen/platforms/README.md), 화면 사용법은 [사용설명서](gen/generator-app/USER_GUIDE.md)를 참고하세요. GitHub Pages 빌드는 동봉된 커밋을 사용하므로 원격의 예전 `main`으로 되돌아가지 않습니다. 새 소스 반영은 명시적인 동기화와 검증 후 진행합니다.

GitHub Pages 배포 주소: https://varzero.github.io/YOUNGDO_Studio/

에이전트 자동 생성: https://varzero.github.io/YOUNGDO_Studio/auto_create/

해당 페이지의 **JSON 필드 설명**에 설정의 모든 하위 필드, 필수 여부·타입·생략 시 기본값, RTL 파라미터 매핑, ID 참조, 즉시값 조립과 명령 판별 우선순위를 설명합니다.

JavaScript를 실행하는 브라우저로 `auto_create/?config=<URL 인코딩한 Studio JSON>`에 접속하면 설정에 맞는 RTL과 ZIP을 생성합니다. `#config=...` 또는 페이지의 JSON 입력란/파일 선택도 지원합니다. `#auto-create-status`의 `data-state`가 `ready`가 되면 `#generated-manifest`의 `textContent`에서 파일 목록을 읽거나 `#download-zip`을 클릭하세요. `error`이면 `#generation-error`를 읽습니다. 개별 파일은 목록의 URL을 열고 같은 완료 표시를 기다린 다음 `#generated-file.textContent`를 UTF-8로 저장합니다. 자세한 에이전트 프롬프트는 해당 페이지에 있습니다. 일반 HTTP GET만으로는 JS 실행 후 결과를 받을 수 없습니다.

브라우저 검증은 `gen/generator-app`에서 `npx playwright install --with-deps chromium --only-shell` 후 `npm run verify:auto`로 실행합니다. GitHub Pages와 같은 하위 경로로 빌드하여 정적 서버에서 주소 입력·개별 파일·ZIP·오류 처리·Studio 출력 일치를 검사합니다.

ZIP은 완성 CPU가 아닙니다. EX 실행 유닛, 데이터 레지스터 파일, 명령어·데이터 메모리는 사용자 프로젝트에 연결해야 합니다. 메모리 경로를 추가한 뒤 LSQ 사용 여부를 선택하세요. LSQ를 켜면 Store도 다음 메모리 명령을 시작해도 되는 시점에 rd=0과 원래 Flow Window + PC로 완료를 반환해야 합니다.

이 커밋의 을숙도 2d5i/LSQ 32엔트리 구성은 Zynq-7020 스케줄러 OOC 합성·배선에서 70MHz를 통과했습니다. 해당 결과는 사용자 설정 전체나 보드 전체의 클럭을 보장하지 않습니다. 자세한 수치는 원본 저장소의 `GEN2_LSQ_FPGA_TIMING.md`에 있습니다.
