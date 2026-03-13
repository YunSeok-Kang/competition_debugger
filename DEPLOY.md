# Submission Debugger Deployment Guide

이 문서는 `submission_debugger`를 다른 서버로 이관해서 실행할 때 필요한 최소 절차를 정리합니다.

## 1) 가져갈 범위

아래는 GitHub에 올리는 대상입니다.

- `submission_debugger/`
- `docs/` (선택)
- 실행/학습 코드 중 협업에 필요한 파일만 선택

아래는 올리지 않는 것이 안전합니다.

- `dataset/` (대용량, 서버에 이미 존재)
- `submission_debugger/data/debugger.db`
- `submission_debugger/data/server.log`
- `submission_debugger/data/server.pid`
- `submission_debugger/data/user_submissions/`
- `wandb/`, `outputs/`, `visualization_output/`

## 2) 서버 준비

서버에 Python 3.10+ 권장.

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip
```

## 3) 코드 배포 (복붙)

```bash
cd /opt
git clone <YOUR_REMOTE_REPO_URL> cvpr_competition
cd /opt/cvpr_competition
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r submission_debugger/requirements.txt
```

## 4) 데이터셋 경로 지정 (심볼릭 링크 불필요)

`SD_DATASET_DIR` 환경변수로 데이터셋 루트를 지정합니다.

필수 구조:

- `$SD_DATASET_DIR/test_metadata.csv`
- `$SD_DATASET_DIR/videos/...`
- `$SD_DATASET_DIR/sim_dataset/labels.csv`
- `$SD_DATASET_DIR/sim_dataset/videos/...`

예시:

```bash
export SD_DATASET_DIR=/data/accident_dataset
```

## 5) 보안 환경변수 설정

```bash
export SD_ADMIN_USER=admin
export SD_ADMIN_PASS='change-this-now'
# HTTPS 프록시 뒤에서 운영 시 권장
export SD_COOKIE_SECURE=1
```

## 6) 서버 실행 (복붙)

```bash
cd /opt/cvpr_competition/submission_debugger
PYTHON_BIN=/opt/cvpr_competition/.venv/bin/python ./scripts/start.sh
./scripts/status.sh
curl -sS http://127.0.0.1:18080/healthz
```

정상 응답 예시:

```json
{"status":"ok","time":"..."}
```

## 7) 방화벽/포트

- 인바운드 TCP `18080` 허용
- 접속: `http://<server-ip>:18080`

## 8) 운영 점검 체크리스트

- [ ] `SD_DATASET_DIR`가 실제 데이터셋 루트를 가리킨다.
- [ ] `curl http://127.0.0.1:18080/healthz`가 성공한다.
- [ ] `/login` 접속 후 관리자 로그인 가능하다.
- [ ] `test`/`train` 모두에서 영상 로드가 된다.
- [ ] 업로드/메모/점수 저장이 정상 동작한다.
- [ ] 서버 재시작 후에도 앱이 정상 구동된다.

## 9) 장애 시 빠른 복구

```bash
cd /opt/cvpr_competition/submission_debugger
./scripts/stop.sh
PYTHON_BIN=/opt/cvpr_competition/.venv/bin/python ./scripts/start.sh
tail -n 200 data/server.log
```

## 10) 기존 운영 DB를 유지해서 이전하고 싶을 때

기존 사용자/권한/메모/댓글/태그를 유지하려면 아래 파일만 별도 백업/복원합니다.

- `submission_debugger/data/debugger.db`

보안 이슈가 있으므로 공개 저장소에는 절대 포함하지 마세요.
