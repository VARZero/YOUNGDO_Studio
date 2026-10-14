# YOUNGDO Studio / 영도 스튜디오

현재 EULSUKDO Gen2 스케줄러의 구조·ISA·디코더·EX 경로를 설정하고 RTL ZIP을 만드는 웹 생성기입니다. **LSQ와 ORYUKDO는 추후 제공**이며 선택·생성할 수 없습니다. 예전 EULSUKDO_LSQ 및 ORYUKDO RTL은 번들에서 제거했습니다.

소스는 `VARZero/EULSUKDO`의 `gen2/src/RTL`입니다. 현재 스냅샷은 `975d3599bff47306901c95eb3eccd530ff8c1636`이며 [소스 버전](gen/platforms/versions.json)에 파일별 SHA-256을 기록합니다. 원본 RTL은 수정 없이 포함합니다.

```sh
cd gen/generator-app
npm ci
npm run dev
# 검증
npm run lint
npm run build
npm run verify:rtl
```

Windows의 RTL 검증은 WSL의 Verilator를 자동 사용합니다. Linux에서는 PATH의 Verilator를 사용합니다. `verify:rtl`은 기본 2d5i, 외부 디코더, 1d3i, 4d7i, 사용자 지정 IST 뱅크·RS FIFO 조합과 ZIP 내용·지원하지 않는 기능 차단을 검사합니다. 원본의 PRM 관련 `UNOPTFLAT` 경고는 `gen/generator-app/verification/`에 보존하며, 그 외 활성화된 경고 및 오류는 검사를 실패시킵니다. 이는 생성된 연결의 검사이며 전체 시스템 시뮬레이션이나 합성을 대신하지 않습니다.

소스 교체는 [플랫폼 안내](gen/platforms/README.md), 화면 사용법은 [사용설명서](gen/generator-app/USER_GUIDE.md)를 참고하세요. GitHub Pages 빌드는 동봉된 커밋을 사용하므로 원격의 예전 `main`으로 되돌아가지 않습니다. 새 소스 반영은 명시적인 동기화와 검증 후 진행합니다.

GitHub Pages 배포 주소: https://varzero.github.io/YOUNGDO_Studio/

에이전트 자동 생성: https://varzero.github.io/YOUNGDO_Studio/auto_create/

해당 페이지의 **JSON 필드 설명**에 설정의 모든 하위 필드, 필수 여부·타입·생략 시 기본값, RTL 파라미터 매핑, ID 참조, 즉시값 조립과 명령 판별 우선순위를 설명합니다.

JavaScript를 실행하는 브라우저로 `auto_create/?config=<URL 인코딩한 Studio JSON>`에 접속하면 설정에 맞는 RTL과 ZIP을 생성합니다. `#config=...` 또는 페이지의 JSON 입력란/파일 선택도 지원합니다. `#auto-create-status`의 `data-state`가 `ready`가 되면 `#generated-manifest`의 `textContent`에서 파일 목록을 읽거나 `#download-zip`을 클릭하세요. `error`이면 `#generation-error`를 읽습니다. 개별 파일은 목록의 URL을 열고 같은 완료 표시를 기다린 다음 `#generated-file.textContent`를 UTF-8로 저장합니다. 자세한 에이전트 프롬프트는 해당 페이지에 있습니다. 일반 HTTP GET만으로는 JS 실행 후 결과를 받을 수 없습니다.

브라우저 검증은 `gen/generator-app`에서 `npx playwright install --with-deps chromium --only-shell` 후 `npm run verify:auto`로 실행합니다. GitHub Pages와 같은 하위 경로로 빌드하여 정적 서버에서 주소 입력·개별 파일·ZIP·오류 처리·Studio 출력 일치를 검사합니다.

ZIP은 완성 CPU가 아닙니다. EX 실행 유닛, 데이터 레지스터 파일, 명령어·데이터 메모리는 사용자 프로젝트에 연결해야 합니다. 메모리 경로를 추가해도 LSQ나 메모리 순서 보장이 생기지 않습니다.
