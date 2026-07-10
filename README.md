# 아나키스트 네트워크

Nostr 전용 릴레이와 SQLite 인덱서를 사용하는 익명 커뮤니티입니다. 브라우저에서 서명한 이벤트만 서버로 전송하며 `nsec`는 현재 탭 메모리에만 유지합니다.

## 기능

- Nostr kind `1` 게시글, NIP-22 kind `1111` 댓글, NIP-25 kind `7` 추천, NIP-09 kind `5` 삭제
- NIP-01 kind `0` 표준 프로필의 `name`과 NIP-78 kind `30078` 앱 설정 기반 커뮤니티 고정닉
- 최신순 피드, 제목·본문·닉네임 검색, 상세 페이지, 댓글
- 게시글 `3p`, 댓글 `1p` 적립 원장과 지갑
- strfry 전용 릴레이와 공용 릴레이 발행 복제
- CLI 기반 게시물 숨김과 공개키 차단

## 로컬 개발

Node.js 24 이상이 필요합니다. SQLite 파일은 기본적으로 `data/anarchos.sqlite`에 생성됩니다.

```bash
npm install
npm run dev
npm run indexer
```

## Ubuntu 서버 운영

Ubuntu 서버에서는 Docker 없이 직접 실행합니다. Node.js, Caddy, Nginx, strfry 릴레이, 정책 플러그인과 systemd 서비스는 설치 스크립트가 구성합니다.

Oracle Cloud Security List에는 외부 TCP `22`, `80`, `443` 포트를 허용해야 합니다. `7777`, `8080`, `3000` 포트는 외부에 열지 않습니다.

```bash
git clone https://github.com/menteai/anarchos.git
cd anarchos
cp .env.example .env
nano .env
sudo bash deploy/native/install.sh
```

`.env`에는 실제 웹 도메인, 릴레이 도메인과 이메일을 입력합니다. Caddy가 웹 HTTPS와 릴레이 WSS 인증서를 자동 발급합니다. 릴레이의 `7777` 포트와 Nginx의 `8080` 포트는 localhost에만 바인딩됩니다.

RAM이 `1GB`인 서버에서는 설치 전에 swap을 추가합니다.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

서비스 상태와 로그는 systemd로 확인합니다.

```bash
systemctl status anarchos-relay anarchos-indexer anarchos-web nginx caddy
journalctl -u anarchos-web -u anarchos-indexer -u anarchos-relay -f
```

코드를 갱신할 때는 다음 명령을 사용합니다.

```bash
git pull --ff-only
sudo bash deploy/native/update.sh
```

## 릴레이 DoS 방어

`infra/relay/strfry.conf`는 WebSocket 프레임, 이벤트 크기, 태그 수, 구독 수, 필터 수, 반환 건수와 sync 건수를 제한합니다. `infra/relay-policy/main.go`는 IP와 공개키별 쓰기 속도, 허용 이벤트 종류, 본문 길이, 차단 공개키를 검사합니다.

릴레이 앞단 Nginx는 IP별 WebSocket 연결을 최대 `10개`, 핸드셰이크를 초당 `5개`로 제한합니다. 릴레이 저장소의 여유 공간이 기본 `1GB` 미만이면 신규 이벤트를 fail-closed 방식으로 거부합니다.

## 운영 CLI

```bash
sudo bash deploy/native/admin.sh hide-event <event-id>
sudo bash deploy/native/admin.sh unhide-event <event-id>
sudo bash deploy/native/admin.sh block-pubkey <hex-pubkey> <reason>
sudo bash deploy/native/admin.sh unblock-pubkey <hex-pubkey>
sudo bash deploy/native/admin.sh list-blocked
sudo bash deploy/native/admin.sh ledger-audit
sudo bash deploy/native/admin.sh reindex
sudo bash deploy/native/admin.sh backfill-relay wss://relay.example.com
```

차단은 신규 이벤트를 거부합니다. 기존 콘텐츠를 숨기려면 `hide-event`를 별도로 실행합니다.

외부 릴레이를 나중에 연결할 때는 `.env`의 `PUBLIC_RELAY_URLS`를 갱신한 뒤 `backfill-relay`를 릴레이별로 한 번씩 실행합니다. 이 명령은 SQLite 색인에 보존된 기존 서명 이벤트를 오래된 순서대로 재발행합니다. 중간에 연결이 끊기면 동일한 명령을 다시 실행해도 되며, 외부 릴레이가 이미 보유한 이벤트는 중복으로 처리됩니다. 기본 전송 간격은 `BACKFILL_DELAY_MS=100`입니다.

SQLite 색인은 `/var/lib/anarchos/anarchos.sqlite`, 릴레이 원본은 `/var/lib/anarchos/strfry-db`에 저장됩니다. 포인트 원장과 원본 이벤트를 보호하려면 `/var/lib/anarchos`를 정기적으로 백업해야 합니다.

## Docker 로컬 검증

Docker 구성은 로컬 통합 테스트용으로 유지합니다.

```bash
docker compose --env-file .env.test.example -f compose.yaml -f compose.smoke-host.yaml up --build -d
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run test:stack
docker compose --env-file .env.test.example -f compose.yaml -f compose.smoke-host.yaml down -v
```
