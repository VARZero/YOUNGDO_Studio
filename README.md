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

ZIP은 완성 CPU가 아닙니다. EX 실행 유닛, 데이터 레지스터 파일, 명령어·데이터 메모리는 사용자 프로젝트에 연결해야 합니다. 메모리 경로를 추가해도 LSQ나 메모리 순서 보장이 생기지 않습니다.
