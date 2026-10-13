# 플랫폼 RTL 소스

현재 제공하는 플랫폼은 **EULSUKDO Gen2**뿐입니다. 원본은 `https://github.com/VARZero/EULSUKDO.git`의 `gen2/src/RTL`이며, `gen/platforms/eulsukdo/RTL`에 8개 파일을 그대로 동봉합니다. LSQ와 ORYUKDO는 추후 제공이며 이전 RTL은 포함하지 않습니다.

`versions.json`에는 원본 커밋과 파일별 SHA-256이 있습니다. 같은 정보가 생성 ZIP의 `SOURCE_VERSION.json`에 포함됩니다. 동기화는 커밋된 파일을 가져오므로 로컬 미커밋 수정은 포함하지 않습니다.

## 현재 버전 재현

```sh
python3 gen/scripts/sync_platforms.py
```

인자를 생략하면 `versions.json`의 커밋을 원격에서 받아 재현합니다. 매일 실행하는 Pages 작업도 이 버전을 유지합니다. 일반 앱 빌드는 체크인된 파일을 사용하므로 소스 동기화나 네트워크가 필요하지 않습니다.

## 옆 디렉터리의 현재 소스로 교체

```sh
python3 gen/scripts/sync_platforms.py --local-repo ../EULSUKDO --ref main
```

원격 `main`을 명시적으로 적용할 때는 `python3 gen/scripts/sync_platforms.py --ref main`을 사용합니다. 현재 Gen2가 없는 리비전은 거절합니다. 소스를 바꾼 뒤 다음을 실행하고 버전 기록과 RTL을 함께 커밋하세요.

```sh
cd gen/generator-app
npm run lint
npm run build
npm run verify:rtl
```

검증은 소스 해시, 파라미터 전달, 생성·외부 디코더 모드의 연결, ZIP의 포함 파일과 기능 차단을 확인합니다. Verilator의 원본 PRM 관련 `UNOPTFLAT` 경고는 로그에 남깁니다. FPGA 자원·타이밍 및 시스템 동작 검증은 별도로 수행합니다.
