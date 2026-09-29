# 플랫폼 RTL 소스

| 선택 | 소스 저장소 | 원본 경로 | 이 작업본의 경로 |
| --- | --- | --- | --- |
| 을숙도 | https://github.com/VARZero/EULSUKDO_LSQ | `gen/src/RTL` | `gen/platforms/eulsukdo/RTL` |
| 오륙도 | https://github.com/VARZero/ORYUKDO | `RTL` | `gen/platforms/oryukdo/RTL` |

`versions.json`은 각각의 원격 커밋을 기록합니다. 생성기에서 플랫폼을 바꾸면 해당 스냅샷의 스케줄러로 top을 만들고, ZIP에는 그 플랫폼의 RTL 파일만 넣습니다. 오륙도는 을숙도 RTL을 섞지 않고 오륙도 저장소에 있는 전체 RTL을 사용합니다. 디코더와 EX는 영도 설정 또는 사용자 RTL이 담당합니다. CSR은 사용자 구현입니다.

최신 원격 소스로 갱신:

```sh
python3 gen/scripts/sync_platforms.py
cd gen/generator-app
npm ci
npm run build
npm run verify:rtl
```

동기화 스크립트는 두 저장소의 기본 브랜치를 새로 clone한 후 RTL 디렉터리와 import 목록을 함께 갱신합니다. 빌드할 때 인터넷이 없어도 체크인된 소스로 생성기가 동작합니다. GitHub Pages 작업은 빌드마다 동기화하며, 매일 한 번 예약 빌드도 수행합니다. 원격 인터페이스가 바뀌어 호환되지 않으면 검증 또는 빌드를 실패시키고 수동 반영이 필요합니다.

현재 원본 레포에는 EX·메모리·CSR 구현이 포함되지 않습니다. ZIP 역시 완성 CPU가 아니라 외부 모듈을 연결할 수 있는 top과 RTL 소스입니다.
