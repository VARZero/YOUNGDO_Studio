# 플랫폼 RTL 소스

EULSUKDO Gen2는 `gen2/src/RTL`의 9개 소스, ORYUKDO Gen3는 `rtl/sources_gen3.f`에 나열된 20개 소스를 동봉합니다. Gen3 manifest에는 `rtl/`과 `gen2/src/RTL/`의 공통 블록이 함께 있습니다. 같은 이름의 구형 FCL 등 manifest에 없는 소스는 넣지 않습니다.

`versions.json`에 원본 커밋, 소스 manifest/폴더, 파일별 원래 경로와 SHA-256이 있습니다. ZIP에는 선택한 플랫폼의 원본과 같은 내용이 들어갑니다. 사용자 LSQ 모드의 파생 스케줄러는 별도 `custom_lsq/`에 두고 원본 해시를 유지합니다.

```sh
# 커밋된 버전 재현 (Pages에서도 실행)
python3 gen/scripts/sync_platforms.py
# 명시적으로 최신 소스로 교체
python3 gen/scripts/sync_platforms.py --platform eulsukdo --local-repo ../EULSUKDO --ref main
python3 gen/scripts/sync_platforms.py --platform oryukdo --local-repo ../ORYUKDO --ref main
```

인자 없는 실행은 원격 main이 아니라 고정 커밋을 가져옵니다. 로컬 동기화도 커밋된 바이트만 읽습니다. 일반 앱 빌드는 체크인된 소스를 사용하며 네트워크가 필요 없습니다. Gen3 manifest가 없는 구형 오륙도 리비전은 거절합니다.

교체 후 `gen/generator-app`에서 `npm run lint`, `npm run build`, `npm run verify:rtl`, `npm run verify:auto`를 실행하세요. upstream 테스트 fixture도 같은 커밋으로 명시적으로 갱신하고 출처를 기록합니다. 소스, 버전, 생성 import와 검증 변경을 함께 커밋하세요.

과거 Gen2 frontier 수정 기록은 [FRONTIER_BOUNDARY_FIX.md](FRONTIER_BOUNDARY_FIX.md)에 남아 있으며 현재 Gen3의 인터페이스 설명이 아닙니다.
