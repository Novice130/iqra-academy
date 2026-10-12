# Deploying to the VPS

How novicetutor.com is hosted, set up, deployed, rolled back, and how to move
it over from Cloudflare Workers. For what the pieces are, read
[architecture.md](architecture.md) first.

| Thing | Where |
| --- | --- |
| Image | `ghcr.io/novice130/iqra-academy` (`Dockerfile` at the repo root) |
| Stack | `deploy/docker-compose.yml` — `caddy`, `web`, `realtime` |
| Proxy config | `deploy/caddy/Caddyfile` |
| Server setup | `deploy/bootstrap.sh` (one time) |
| Deploy / rollback | `deploy/deploy.sh`, run by the `deploy` job in `.github/workflows/ci.yml` |
| On the server | everything under `/opt/novicetutor` |

```
/opt/novicetutor/
├── docker-compose.yml     copied by every deploy
├── deploy.sh              copied by every deploy
├── caddy/Caddyfile        copied by every deploy
├── .env                   runtime secrets, 600 — yours to maintain
├── certs/origin.pem       Cloudflare Origin CA certificate
├── certs/origin.key       its private key, 600
├── downloads/             APKs and installers
├── .image_tag             tag currently live (written by deploy.sh)
└── .image_tag.prev        tag before that
```

## Two things to check before going live

**1. Where the database is relative to the server.** The app talks to Neon on
every request. A persistent pool removes the handshake cost, but not distance:
a server in Germany or Finland talking to a Neon project in a US region adds
roughly 90 ms to *every query*, and a page runs several. Look at the host in
`DATABASE_URL` (it names the region) and at the server's location in the
Hetzner console. If they are on different continents, recreate the server in a
matching location before cutover — it is far cheaper than moving it afterwards.

**2. The server's CPU architecture.** Run `uname -m` on the box. `x86_64`
(Hetzner CX/CPX) needs no action. `aarch64` (Hetzner CAX) needs the repository
variable `DEPLOY_PLATFORM` set to `linux/arm64`, or the image will not start.

## First-time server setup

Ubuntu, with Docker and the compose plugin already installed.

```sh
# from your machine
scp deploy/bootstrap.sh root@<server-ip>:/root/
ssh root@<server-ip> 'bash /root/bootstrap.sh'
```

That creates a `deploy` user (in the `docker` group, with root's authorized
keys copied across), the `/opt/novicetutor` layout, 2 GB of swap, `ufw` allowing
22/80/443, and unattended security upgrades. It is safe to re-run.

It does **not** turn off SSH password logins unless asked. Once
`ssh deploy@<server-ip>` works with a key, from a second terminal:

```sh
ssh root@<server-ip> 'bash /root/bootstrap.sh --harden-ssh'
```

Keep the first session open until a fresh key login has succeeded.

### Deploy key

CI needs its own key to reach the server. Do not reuse a personal one.

```sh
ssh-keygen -t ed25519 -f ./novicetutor-deploy -N "" -C "github-actions-deploy"
ssh-copy-id -i ./novicetutor-deploy.pub deploy@<server-ip>
ssh-keyscan -H <server-ip>        # output goes into DEPLOY_KNOWN_HOSTS
```

The private half goes into the `DEPLOY_SSH_KEY` secret; then delete the local
copy.

### Hetzner Cloud Firewall

`ufw` cannot do this part: ports published by Docker bypass it. In the Hetzner
console, attach a Cloud Firewall to the server:

- **22/tcp** — your own IP(s). CI also needs it; GitHub-hosted runners have no
  fixed address, so either leave 22 open to all (key-only login makes that
  acceptable) or use a self-hosted runner.
- **443/tcp** — Cloudflare's ranges only: <https://www.cloudflare.com/ips/>.
  This is what stops anyone reaching the origin directly, around Cloudflare.
- **80/tcp** — not needed; Cloudflare connects on 443 in Full (strict) mode.

Add the 443 restriction **after** the verification step in the cutover below,
or allow your own IP on 443 as well until then.

## Cloudflare settings

The zone stays on Cloudflare. In the dashboard for `novicetutor.com`:

1. **SSL/TLS → Origin Server → Create Certificate.** Hostnames
   `novicetutor.com` and `*.novicetutor.com`, 15 years. Save the certificate as
   `/opt/novicetutor/certs/origin.pem` and the key as
   `/opt/novicetutor/certs/origin.key` (`chmod 600`, owned by `deploy`). The
   key is shown once.
2. **SSL/TLS → Overview → Full (strict).**
3. **Network → WebSockets: On.** The scheduling realtime channel depends on it.
4. **Rules → Transform Rules → Managed Transforms → "Add visitor location
   headers": On.** This sends `cf-timezone`, which the app uses to show class
   times in the visitor's zone before they have a profile. Without it the app
   falls back to the browser/profile zone.
5. **DNS** — done as part of the cutover, not before: proxied (orange-cloud)
   `A` records for `novicetutor.com` and `www` pointing at the server.

## GitHub settings

Repository → Settings → Secrets and variables → Actions.

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `DEPLOY_HOST` | server IP or hostname |
| Secret | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | the private deploy key, whole file |
| Secret | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -H <server-ip>`. Optional but recommended; without it each run trusts whatever host key it sees |
| Variable | `DEPLOY_ENABLED` | `true` — the deploy job is skipped until this is set |
| Variable | `DEPLOY_PLATFORM` | `linux/amd64` (default) or `linux/arm64` |
| Variable | `NEXT_PUBLIC_APP_URL` | `https://novicetutor.com` (default if unset) |
| Variable | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the web-push public key |
| Variable | `DEPLOY_RUNNER` | optional runner label, e.g. an arm64 runner to avoid a slow emulated build |
| Variable | `DEPLOY_PORT` | optional SSH port, default 22 |

`NEXT_PUBLIC_*` values are compiled into the image. Changing one means a new
build, not an edit on the server.

The image is pushed with the workflow's own `GITHUB_TOKEN`; no registry
credential needs creating. The server logs in to GHCR with that same token
during each deploy.

## The `.env` on the server

Start from `deploy/env.example`:

```sh
scp deploy/env.example deploy@<server-ip>:/opt/novicetutor/.env
ssh deploy@<server-ip> 'chmod 600 /opt/novicetutor/.env && nano /opt/novicetutor/.env'
```

- `DATABASE_URL` is Neon's **pooled** endpoint (host contains `-pooler`).
- `REALTIME_SECRET` must be **newly generated** (`openssl rand -base64 32`).
  The Workers build carried a hardcoded fallback value that is in git history;
  treat it as public.
- The values currently live as Cloudflare Worker secrets cannot be read back
  out of Cloudflare. Each has to come from its source (Neon, Stripe, Resend,
  LiveKit, Firebase consoles) or from a local `.env` that still has it.
- A value containing a literal `$` needs single quotes around it.

After editing `.env`, apply it with `cd /opt/novicetutor && ./deploy.sh "$(cat .image_tag)"`.

## Deploying

Merging to `master` is the deploy. The `deploy` job runs after every CI gate
passes and:

1. builds the image for `DEPLOY_PLATFORM`;
2. boots it in the runner — `web`, `realtime` and a throwaway Postgres — and
   checks `/healthz`, `/api/health` and `/login` answer;
3. pushes `:<commit-sha>` and `:latest` to GHCR;
4. copies the compose file, Caddyfile and `deploy.sh` to the server and runs
   `deploy.sh <commit-sha>`.

`deploy.sh` pulls the tag, restarts the containers, and waits up to two minutes
for both to be healthy and for `/api/health` to report the database reachable.
If that does not happen it puts the previous tag back and fails the job.

The restart is a few seconds of 502s. Calls in progress are not affected —
video runs through LiveKit Cloud, not this server — but avoid deploying in the
minute a class is starting.

By hand, from the server:

```sh
cd /opt/novicetutor
./deploy.sh <commit-sha>      # any tag that exists in GHCR
./deploy.sh --rollback        # back to the tag that was live before the last deploy
```

Looking at it:

```sh
docker compose ps
docker compose logs -f --tail=100 web
docker compose logs -f --tail=100 realtime
docker stats --no-stream
```

## Publishing an app build

The download page lists whatever is in `/opt/novicetutor/downloads`. Full
runbook in [publishing-builds.md](publishing-builds.md); the short form:

```sh
scp apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk \
  deploy@<server-ip>:/opt/novicetutor/downloads/novice-tutor.apk
```

No deploy and no restart.

## Cutover from Cloudflare Workers

Do this outside class hours. Nothing is switched until step 5.

1. **Server ready.** Bootstrap done, certs and `.env` in place, GitHub secrets
   and variables set, `DEPLOY_ENABLED=true`.
2. **First deploy.** Push to `master` (or re-run the workflow). Confirm
   `docker compose ps` shows three healthy containers.
3. **Copy the downloads.** The APKs and installers are still in the R2 bucket
   `novicetutor-app`. Pull each one down and `scp` it into
   `/opt/novicetutor/downloads` under the same filename:
   `npx wrangler r2 object get novicetutor-app/novice-tutor.apk --file novice-tutor.apk --remote`
   (and likewise `novice-tutor-arm32.apk`, `novice-tutor-setup.exe`,
   `novice-tutor.dmg`).
4. **Verify against the server directly, before any DNS change.** Add to
   `/etc/hosts` on your machine:

   ```
   <server-ip>  novicetutor.com www.novicetutor.com
   ```

   The browser will warn about the certificate — expected, because an Origin CA
   certificate is only trusted by Cloudflare — so proceed past it, or use
   `curl -k --resolve novicetutor.com:443:<server-ip> https://novicetutor.com/api/health`.
   Your IP must be allowed on 443 in the Hetzner firewall for this. Check: sign
   in; open a dashboard and confirm the realtime socket connects (Network tab,
   `/api/realtime/ws` shows 101); start and join a test class; open
   `/app/download` and download a build. **Remove the hosts entry afterwards.**

   This is the production database: anything created here is real.
5. **Switch, as one step.** In the Cloudflare dashboard, in this order and
   without pausing between them:
   1. Workers & Pages → `novicetutor` → Settings → Triggers → **delete the cron
      trigger**.
   2. Same page → **remove both custom domains** (`novicetutor.com`,
      `www.novicetutor.com`).
   3. DNS → add **proxied `A` records** for `@` and `www` → the server IP.

   The cron has to go at the same moment as the routes. The Worker's Durable
   Object has no subscribers once traffic has moved; if its cron keeps
   draining the outbox it will mark events as published that reached nobody,
   and the VPS will never retry them.
6. **Confirm through Cloudflare.** `curl -sI https://novicetutor.com` shows
   `server: cloudflare`; `/api/health` reports `"status":"ok"`; sign in and
   repeat the realtime and class checks from step 4.
7. **Lock down 443** to Cloudflare's ranges in the Hetzner firewall.
8. **Rotate `REALTIME_SECRET`** if the value on the server was ever used by the
   Worker.
9. **Keep the Worker deployed for two weeks.** Do not delete it, its secrets or
   the R2 bucket. After that, delete the Worker and the Durable Object
   namespace; the bucket can go once the downloads are confirmed on the server.

Stripe's webhook, the Google OAuth redirect and the mobile/desktop apps all
point at `https://novicetutor.com` and need no change.

### Rolling back the cutover

Within the two weeks: delete the two `A` records and re-add the custom domains
and the cron trigger on the Worker. Cloudflare applies both within seconds. The
database was shared throughout, so no data moves either way. The Worker runs
the code as of its last deploy — anything that needed a schema change shipped
since then will not work on it.

## Known gaps

- **`/api/health` runs schema statements on every call** and returns 200 even
  when the database is down. The compose healthcheck therefore uses a static
  file for liveness, and only `deploy.sh` calls `/api/health` (once, reading
  the body). It should be split into a cheap liveness route and the migration
  moved out.
- **One server, no redundancy.** If the box is down, the site is down. Hetzner
  snapshots or backups of the server are worth enabling; the data itself lives
  in Neon, so the server holds nothing that cannot be rebuilt except `.env`,
  the certificate and `downloads/`.
- **No uptime monitor.** Point an external check at
  `https://novicetutor.com/api/health`.
