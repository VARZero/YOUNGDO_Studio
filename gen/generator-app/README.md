# YOUNGDO Studio

EULSUKDO와 ORYUKDO Gen2를 사용하는 웹 생성기입니다. 을숙도의 두 FIFO 방식 LSQ는 선택형이며 기본 OFF입니다. 오륙도는 복구·예외·인터럽트·Store 전달과 순차 외부 공개를 포함하며 정적/외부 분기예측기를 선택할 수 있습니다. 최신 연결 계약과 검증 범위는 [사용설명서](USER_GUIDE.md)를 참고하세요.

오륙도는 기존 **내장 LSQ**를 기본값으로 유지하면서 **사용자 LSQ RTL** 교체 옵션을 제공합니다. `lsqMode="custom"`을 선택하고 ZIP의 `RTL/custom_lsq/oryukdo_custom_lsq.sv`를 수정하세요. 시작 파일은 기존 엔진을 호출하며, 사용자 구현의 연결 계약은 ZIP의 `INTEGRATION.md`에 있습니다.

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run verify:rtl
```

[사용설명서](USER_GUIDE.md) · [플랫폼 소스와 동기화](../platforms/README.md)
