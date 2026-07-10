# Anarchos

Anarchos is a self-hosted, Nostr-backed community website. Each deployment can run its own web application and strfry relay, connect to other Anarchos relays, publish events to all configured relays, and build a local SQLite read model from the combined event stream.

The browser signs events locally. Secret keys are never sent to the server, and an imported `nsec` is kept only in the current tab's memory.

## What it provides

- Nostr kind `1` posts
- NIP-22 kind `1111` comments
- NIP-25 kind `7` reactions
- NIP-09 kind `5` deletions
- NIP-01 kind `0` profile metadata
- NIP-78 kind `30078` fixed-nickname settings
- A chronological feed, search, post pages, comments, and reactions
- A local points ledger: `3p` for an eligible post and `1p` for an eligible comment
- Simultaneous subscription and publication across the local relay and every relay in `PUBLIC_RELAY_URLS`
- Event-ID deduplication when the same signed event exists on multiple relays
- Local moderation commands for hiding events and blocking public keys

## Architecture

```text
Browser
  | signs Nostr events locally
  v
Next.js API
  | publishes to the local relay and configured remote relays
  v
Nostr relays
  | subscribed to independently by the indexer
  v
SQLite projection
  | feed, search, profiles, comments, reactions, local wallet
  v
Next.js website
```

The signed Nostr event is the portable public record. SQLite is a local projection used for efficient queries and may be rebuilt from the events already collected by a deployment.

The points ledger, wallet balance, hidden-event state, and blocked-key list are intentionally local. They are not synchronized through Nostr.

## Event and nickname behavior

Public content is recoverable from relay events:

- Posts use kind `1`.
- Comments use kind `1111`.
- Reactions use kind `7`.
- Deletions use kind `5`.
- Profile names use kind `0`.
- Fixed-nickname enablement uses kind `30078` with `d=anarchos:fixed-nickname`.
- The display name used for a post or comment is copied into that event's `display_name` tag.

A nickname change only affects newly created posts and comments. Existing posts and comments continue to display the name stored in their own signed event, so historical names remain stable across deployments and after reindexing.

## Requirements

For local development:

- Node.js 24 or newer
- npm
- Access to a compatible Nostr relay, or Docker for the complete local stack

For the native Ubuntu deployment:

- A supported Ubuntu server with root or sudo access
- Two DNS names pointing to the server: one for the website and one for the relay
- Public TCP ports `80` and `443`; SSH commonly uses `22`
- Do not expose internal ports `3000`, `7777`, or `8080`

## Environment variables

Copy `.env.example` to `.env` and edit it before deployment.

```env
WEB_DOMAIN=community.example.com
RELAY_DOMAIN=relay.example.com
NEXT_PUBLIC_RELAY_URL=wss://relay.example.com
PUBLIC_RELAY_URLS=
ACME_EMAIL=admin@example.com
RELAY_MIN_FREE_BYTES=1073741824
BACKFILL_DELAY_MS=100
```

| Variable | Purpose |
| --- | --- |
| `WEB_DOMAIN` | Public hostname of the website, without `https://`. |
| `RELAY_DOMAIN` | Public hostname of this deployment's relay, without `wss://`. |
| `NEXT_PUBLIC_RELAY_URL` | Public `wss://` URL of this deployment's relay. It is written into relay hints used by comments. |
| `PUBLIC_RELAY_URLS` | Comma-separated remote `ws://` or `wss://` relay URLs. The web publisher and indexer use the union of the local relay and this list. |
| `ACME_EMAIL` | Email used by Caddy when obtaining TLS certificates. |
| `RELAY_MIN_FREE_BYTES` | Minimum free space that must remain in the relay database filesystem. New events are rejected below this reserve. |
| `BACKFILL_DELAY_MS` | Delay between events when copying historical events to another relay. |

`PUBLIC_RELAY_URLS` is normalized and deduplicated. Do not include credentials in relay URLs. Only `ws://` and `wss://` are accepted.

## Local development

Install dependencies:

```bash
npm install
```

If a compatible relay is already available at `ws://localhost:7777`, start the web application and indexer in separate terminals:

```bash
npm run dev
```

```bash
npm run indexer
```

The default SQLite database is created at `data/anarchos.sqlite`.

For a complete local stack including a relay, reverse proxies, and persistent Docker volumes, use the Docker workflow below instead.

## Run the complete stack with Docker

Create `.env` first, then start the stack:

```bash
docker compose up --build -d
```

Follow logs:

```bash
docker compose logs -f web indexer relay relay-guard caddy
```

Stop the stack without deleting data:

```bash
docker compose down
```

Delete the Docker volumes only when you intentionally want to remove the local database, relay store, policy state, and Caddy state:

```bash
docker compose down -v
```

The repository also contains a smoke-test configuration:

```bash
docker compose --env-file .env.test.example \
  -f compose.yaml \
  -f compose.smoke-host.yaml \
  up --build -d

NODE_TLS_REJECT_UNAUTHORIZED=0 npm run test:stack

docker compose --env-file .env.test.example \
  -f compose.yaml \
  -f compose.smoke-host.yaml \
  down -v
```

## Deploy a new website and relay on Ubuntu

### 1. Prepare DNS

Create DNS records for both hostnames before running the installer. For example:

```text
community.example.com  -> your server IP
relay.example.com      -> your server IP
```

Caddy uses these names to request HTTPS and WSS certificates. Certificate issuance will fail when the records do not point to the server or ports `80` and `443` are blocked.

### 2. Open only the public ports

Allow inbound TCP:

```text
22   SSH, if used
80   HTTP and ACME validation
443  HTTPS and secure WebSocket relay traffic
```

Do not open `3000`, `7777`, or `8080` to the internet. The native deployment binds those services locally and exposes them through Caddy and Nginx.

### 3. Clone and configure the project

```bash
git clone https://github.com/rororo401/anarchy.git
cd anarchy
cp .env.example .env
nano .env
```

Example for a standalone deployment:

```env
WEB_DOMAIN=community.example.com
RELAY_DOMAIN=relay.example.com
NEXT_PUBLIC_RELAY_URL=wss://relay.example.com
PUBLIC_RELAY_URLS=
ACME_EMAIL=admin@example.com
RELAY_MIN_FREE_BYTES=1073741824
BACKFILL_DELAY_MS=100
```

### 4. Add swap on a small server

A machine with about 1 GB of RAM may need swap while compiling dependencies:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 5. Run the native installer

```bash
sudo bash deploy/native/install.sh
```

The installer sets up:

- Node.js
- Caddy
- Nginx
- strfry
- the relay policy plugin
- the Next.js application
- the event indexer
- systemd services

It stores application data under `/var/lib/anarchos` and the generated environment file at `/etc/anarchos/anarchos.env`.

### 6. Verify the deployment

```bash
systemctl status anarchos-relay anarchos-indexer anarchos-web nginx caddy
```

```bash
journalctl -u anarchos-web \
  -u anarchos-indexer \
  -u anarchos-relay \
  -f
```

Open the website at:

```text
https://community.example.com
```

The public relay endpoint is:

```text
wss://relay.example.com
```

## Create another independent community deployment

To create a separate website and relay from this codebase:

1. Fork or clone the repository into a new project.
2. Choose a new website hostname and relay hostname.
3. Change visible branding in the React components and metadata as needed.
4. Create a new `.env` containing the new hostnames.
5. Deploy it on a separate server with `deploy/native/install.sh`, or use Docker.
6. Leave `PUBLIC_RELAY_URLS` empty for an isolated community, or add trusted peer relays to share events.

Each deployment has its own:

- relay database
- SQLite projection
- local points ledger and wallet balances
- hidden-event state
- blocked-key list
- web domain and relay domain

Connecting deployments shares signed public events. It does not merge wallets or moderation policy.

## Connect two Anarchos relays

Assume two deployments:

```text
Node A website: https://a.example.com
Node A relay:   wss://relay-a.example.com

Node B website: https://b.example.com
Node B relay:   wss://relay-b.example.com
```

For a symmetric connection, configure each node to include the other relay.

Node A `.env`:

```env
WEB_DOMAIN=a.example.com
RELAY_DOMAIN=relay-a.example.com
NEXT_PUBLIC_RELAY_URL=wss://relay-a.example.com
PUBLIC_RELAY_URLS=wss://relay-b.example.com
ACME_EMAIL=admin-a@example.com
RELAY_MIN_FREE_BYTES=1073741824
BACKFILL_DELAY_MS=100
```

Node B `.env`:

```env
WEB_DOMAIN=b.example.com
RELAY_DOMAIN=relay-b.example.com
NEXT_PUBLIC_RELAY_URL=wss://relay-b.example.com
PUBLIC_RELAY_URLS=wss://relay-a.example.com
ACME_EMAIL=admin-b@example.com
RELAY_MIN_FREE_BYTES=1073741824
BACKFILL_DELAY_MS=100
```

On each native deployment, apply the updated environment and restart the affected services:

```bash
sudo bash deploy/native/update.sh
```

The result is:

- New events created on Node A are published to relays A and B.
- New events created on Node B are published to relays B and A.
- Each indexer subscribes to both relays.
- The same event received from both relays is indexed once by Nostr event ID.
- `event_relays` records every relay from which the event was observed.

For Docker deployments, update `.env` and recreate the services:

```bash
docker compose up --build -d
```

## Connect more than two relays

List multiple remote relays with commas:

```env
PUBLIC_RELAY_URLS=wss://relay-b.example.com,wss://relay-c.example.com,wss://relay-d.example.com
```

Every newly submitted event is attempted on the local relay and every configured remote relay. Submission succeeds when at least one relay accepts it. The API response retains the individual result for each relay.

The indexer opens an independent subscription to each configured relay and reconnects automatically after a disconnect.

### Recommended network shapes

For a small private federation, use one of these patterns:

- **Full mesh:** every node lists every other node. Simple and redundant, but connection count grows quickly.
- **Shared hub:** every node lists one or two trusted shared relays. Easier to operate, but the shared relays become important infrastructure.
- **Partial mesh:** nodes list selected peers and periodically backfill important relays.

For predictable results, all replicas serving the same community should share at least one durable relay or use equivalent relay lists.

## Important relay-scope warning

The current indexer subscribes by event kind:

```text
0, 1, 5, 7, 1111, 30078
```

It does not yet require a community-specific tag. Connecting a large general-purpose public relay may therefore import unrelated events that satisfy this application's validation rules.

Use trusted relays operated for this application unless you intentionally want to ingest a broader event stream. A future federation-hardening step would be to require and query a community identifier tag.

## Copy historical events to a newly connected relay

Adding a relay to `PUBLIC_RELAY_URLS` begins live subscription and publication, but it does not automatically push the deployment's entire existing history into that relay.

On a native deployment, backfill the target relay:

```bash
sudo bash deploy/native/admin.sh backfill-relay wss://relay-b.example.com
```

The command reads the signed events stored in the local SQLite `events` table and publishes them in order. Existing events reported as duplicates are treated as already present.

The default delay is controlled by:

```env
BACKFILL_DELAY_MS=100
```

The command is safe to run again after an interruption. Events already present on the target relay should be reported as duplicates rather than creating new Nostr events.

For a fully populated two-node federation, run the appropriate backfill in both directions:

```text
On Node A: backfill relay B
On Node B: backfill relay A
```

Backfill copies only events already present in the local SQLite event archive. It does not copy wallet balances, local moderation records, or relay database files.

## Rebuild the SQLite projection

Rebuild posts, comments, reactions, and profiles from the locally archived signed events:

```bash
sudo bash deploy/native/admin.sh reindex
```

Reindexing does not recreate or delete the local points ledger. It also preserves the event-level nickname stored in each post or comment.

## Operations and moderation

Hide or restore an event locally:

```bash
sudo bash deploy/native/admin.sh hide-event <event-id>
sudo bash deploy/native/admin.sh unhide-event <event-id>
```

Block or unblock a public key locally:

```bash
sudo bash deploy/native/admin.sh block-pubkey <hex-pubkey> <reason>
sudo bash deploy/native/admin.sh unblock-pubkey <hex-pubkey>
sudo bash deploy/native/admin.sh list-blocked
```

Audit local point balances:

```bash
sudo bash deploy/native/admin.sh ledger-audit
```

A public-key block prevents new events from that key on the local deployment. It does not automatically hide previously indexed content; use `hide-event` when required.

Moderation state is local and is not propagated to connected relays or other website operators.

## Update a native deployment

```bash
cd /path/to/anarchy
git pull --ff-only
sudo bash deploy/native/update.sh
```

The update script installs exact npm dependencies, builds the application, refreshes `/etc/anarchos/anarchos.env`, and restarts the web application, indexer, and Caddy.

After changes to relay policy or native relay configuration, rebuild or reinstall the relevant native components rather than assuming `update.sh` has replaced them.

## Data locations and backups

Native deployment defaults:

```text
SQLite database:       /var/lib/anarchos/anarchos.sqlite
strfry relay database: /var/lib/anarchos/strfry-db
blocked-key file:      /var/lib/anarchos/blocked-pubkeys.txt
runtime environment:   /etc/anarchos/anarchos.env
```

Back up `/var/lib/anarchos` regularly. The relay database is the strongest local source for relay history, while SQLite also contains the local wallet and moderation state that cannot be reconstructed from public Nostr events.

Before restoring or copying live databases, stop the relevant services or use a storage-level snapshot method that provides a consistent view.

## Relay protections

The included relay stack applies several limits:

- allowed event kinds only
- future timestamp rejection
- event content and tag limits
- IP and public-key write-rate limits
- WebSocket connection and handshake limits
- blocked-public-key enforcement
- minimum free-disk reserve with fail-closed writes

`infra/relay/strfry.conf` contains strfry limits. `infra/relay-policy/main.go` implements event validation, rate limits, blocked keys, and disk-reserve checks. Nginx limits relay WebSocket connections before forwarding them to strfry.

These controls reduce accidental and low-effort abuse but do not replace monitoring, operating-system hardening, backups, or upstream network protections.

## Validation commands

Run the static and behavioral checks:

```bash
npm run typecheck
npm run lint
npm run test:events
npm run test:rate-limit
npm run test:relay
npm run test:backfill
npm run test:multi-relay
```

Run the Go relay-policy tests:

```bash
go test ./infra/relay-policy
```

## Troubleshooting

### The indexer cannot connect to a relay

Check the configured URLs and service logs:

```bash
journalctl -u anarchos-indexer -f
```

Relay URLs must begin with `ws://` or `wss://`. Public deployments normally use `wss://`.

### Events appear twice

The application deduplicates only exact Nostr event IDs. Two independently signed events with identical text are different events and are expected to appear separately.

### A new relay shows only new content

Run `backfill-relay` to copy the historical signed events already present in the local event archive.

### Another deployment does not show an event

Check all of the following:

- the relevant relay is included in `PUBLIC_RELAY_URLS`
- the indexer is connected to that relay
- at least one relay accepted the event at submission time
- the event kind and fields satisfy this project's validation policy
- the public key is not locally blocked
- historical events have been backfilled when necessary

### TLS certificate issuance fails

Confirm that both DNS names point to the server and that inbound ports `80` and `443` are reachable. Then inspect Caddy logs:

```bash
journalctl -u caddy -f
```
