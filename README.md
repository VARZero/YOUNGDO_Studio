# YOUNGDO Studio / 영도 스튜디오

을숙도와 오륙도 RTL 플랫폼을 고르고, 공통 ISA·디코더·EX 구성과 선택형 LSQ를 설정하는 웹 생성기입니다. 오륙도에는 분기예측 인터페이스와 복구 회로가 포함됩니다. 외부 EX·CSR·메모리는 사용자 프로젝트에서 구현합니다.

## 플랫폼 소스

| 플랫폼 | 원본 저장소 | 원본 경로 |
| --- | --- | --- |
| EULSUKDO | https://github.com/VARZero/EULSUKDO_LSQ | `gen/src/RTL` |
| ORYUKDO | https://github.com/VARZero/ORYUKDO | `RTL` |

두 저장소의 최신 `main`을 가져와 동봉된 RTL과 소스 커밋을 갱신합니다:

```sh
python3 gen/scripts/sync_platforms.py
cd gen/generator-app
npm ci
npm run lint
npm run build
npm run verify:rtl
```

RTL 검증에는 Verilator가 필요합니다. 소스 동기화 없이도 체크인된 스냅샷으로 빌드할 수 있습니다. ZIP에는 선택한 플랫폼의 RTL만 들어가며 `SOURCE_VERSION.json`에 사용한 커밋을 기록합니다. 상세 내용은 [플랫폼 안내](gen/platforms/README.md)를 참고하세요.

GitHub Pages 작업은 배포할 때마다 두 원격의 최신 소스를 가져와 빌드·검증하며 매일 예약 실행됩니다. 생성기 주소는 https://varzero.github.io/YOUNGDO_Studio/ 입니다.

처음 배포할 때:

1. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 지정합니다.
2. **Actions → Deploy YOUNGDO Studio → Run workflow**에서 `main` 브랜치를 실행합니다.
3. 작업이 성공하면 위 생성기 주소로 접속합니다. 이후 `main`의 앱·플랫폼·배포 설정 변경은 자동 배포됩니다.

로컬에서 Pages 경로를 검증하려면 `gen/generator-app`에서 `GITHUB_PAGES=true GITHUB_REPOSITORY=VARZero/YOUNGDO_Studio npm run build`를 실행합니다.

원본의 테스트벤치는 이 생성기 저장소에 포함하지 않습니다. 생성 RTL은 연결할 디코더·EX·메모리·CSR 구현과 함께 통합 검증해야 합니다.
