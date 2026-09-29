# YOUNGDO Studio

먼저 을숙도 또는 오륙도를 선택하고, 공통 ISA·EX 경로와 선택형 LSQ를 설정합니다. 오륙도에서는 복구 회로와 기본 분기예측기가 포함되며 외부 예측기를 연결할 수 있습니다. CSR은 사용자가 별도 구현합니다. `Generate ZIP`으로 top·디코더·선택한 플랫폼의 RTL 소스를 받습니다. 기본 프로파일은 을숙도이며 기존 JSON 설정은 불러올 수 있습니다.

소스 기준은 [을숙도 `gen/src/RTL`](https://github.com/VARZero/EULSUKDO_LSQ/tree/main/gen/src/RTL)과 [오륙도 `RTL`](https://github.com/VARZero/ORYUKDO/tree/main/RTL)입니다. 현재 내장 버전과 갱신 방법은 [플랫폼 소스 안내](../platforms/README.md)에 있습니다. 내보낸 ZIP의 `SOURCE_VERSION.json`에도 해당 커밋이 기록됩니다.

실행 방법은 [웹앱 안내](../WEB_APPS.md), 화면별 사용법과 ZIP 내용은 [생성기 사용설명서](USER_GUIDE.md)에 적었습니다.
