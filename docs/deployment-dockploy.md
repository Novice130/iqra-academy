# ============================================================================
# 🚀 Dockploy Deployment Guide — Iqra Academy
# ============================================================================
#
# This guide walks you through deploying all 4 services on your VPS
# using Dockploy. Every step is documented so you can pick up from
# any point if something goes wrong.
#
# TOTAL TIME: ~30 minutes
# SERVICES: Next.js App, Jitsi Meet, Cal.com, Twenty CRM
# ============================================================================

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [DNS Setup](#2-dns-setup)
3. [Generate Secrets](#3-generate-secrets)
4. [Deploy the Next.js App](#4-deploy-the-nextjs-app)
5. [Deploy Jitsi Meet](#5-deploy-jitsi-meet)
6. [Deploy Cal.com](#6-deploy-calcom)
7. [Deploy Twenty CRM](#7-deploy-twenty-crm)
8. [Post-Deploy Checklist](#8-post-deploy-checklist)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] A VPS with **Dockploy installed** and running
- [ ] **Docker** and **Docker Compose** installed on the VPS
- [ ] A **Neon database** created at [neon.tech](https://neon.tech)
- [ ] Access to your **domain DNS** (to add A records)
- [ ] **Stripe** account with API keys
- [ ] **Resend** account with API key
- [ ] **Google Cloud** OAuth credentials (for Google Sign-In)

---

## 2. DNS Setup

Add these **A records** pointing to your VPS IP address:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `quran` | `YOUR_VPS_IP` | 300 |
| A | `meet` | `YOUR_VPS_IP` | 300 |
| A | `cal` | `YOUR_VPS_IP` | 300 |
| A | `crm` | `YOUR_VPS_IP` | 300 |

> **Where to do this:** Go to your domain registrar (e.g., Namecheap, Cloudflare)
> → DNS Management → Add Record.
>
> These create: `quran.learnnovice.com`, `meet.learnnovice.com`, etc.

**Wait 5-10 minutes** for DNS propagation, then verify:
```bash
# On your local machine:
nslookup quran.learnnovice.com
# Should return your VPS IP
```

---

## 3. Generate Secrets

You need several random secrets. Generate them on your VPS:

```bash
# Run this on your VPS to generate all secrets at once:
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "JITSI_APP_ID=iqra-academy"
echo "JITSI_JWT_SECRET=$(openssl rand -base64 32)"
echo "JICOFO_AUTH_PASSWORD=$(openssl rand -hex 16)"
echo "JVB_AUTH_PASSWORD=$(openssl rand -hex 16)"
echo "CALCOM_NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "CALCOM_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "TWENTY_DB_PASSWORD=$(openssl rand -hex 16)"
echo "TWENTY_ACCESS_TOKEN_SECRET=$(openssl rand -base64 32)"
echo "TWENTY_LOGIN_TOKEN_SECRET=$(openssl rand -base64 32)"
echo "TWENTY_REFRESH_TOKEN_SECRET=$(openssl rand -base64 32)"
echo "TWENTY_FILE_TOKEN_SECRET=$(openssl rand -base64 32)"
```

**Save all these values!** You'll need them for the environment variables below.

---

## 4. Deploy the Next.js App

### In Dokploy:

1. **Create New Project** → Name: `iqra-academy`
2. **Add Service** → Type: **Application** → Source: **Git**
3. Enter your **Git repository URL** and branch (`main`)
4. **Build**: Dokploy will auto-detect the `Dockerfile`
5. **Domain**: Set to `quran.learnnovice.com`
6. **SSL**: Enable (Dokploy auto-provisions via Let's Encrypt)

> **TIP:** All other services (Jitsi, Cal.com, CRM) are added as
> additional services **inside this same `iqra-academy` project**.
> No need to create separate projects.

### Environment Variables:

Set these in Dockploy → Project → Environment:

```env
# ── Core ──
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://quran.learnnovice.com

# ── Database (Neon) ──
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/iqra?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/iqra?sslmode=require

# ── Auth ──
BETTER_AUTH_SECRET=<generated-above>
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>

# ── Stripe ──
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Cal.com ──
CALCOM_API_URL=https://cal.learnnovice.com
CALCOM_WEBHOOK_SECRET=<your-calcom-webhook-secret>

# ── Jitsi ──
JITSI_DOMAIN=meet.learnnovice.com
JITSI_APP_ID=iqra-academy
JITSI_JWT_SECRET=<generated-above>

# ── Email ──
RESEND_API_KEY=re_...
EMAIL_FROM=Iqra Academy <noreply@learnnovice.com>

# ── Web Push ──
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:admin@learnnovice.com

# ── CRM ──
TWENTY_API_URL=https://crm.learnnovice.com/api
TWENTY_API_KEY=<from-twenty-settings>
CRM_SYNC_ENABLED=true
```

### Verify:
```
Visit: https://quran.learnnovice.com/api/health
Expected: { "status": "ok", "database": "connected" }
```

---

## 5. Deploy Jitsi Meet

### In Dokploy (same `iqra-academy` project):

1. Open your `iqra-academy` project
2. **Add Service** → Type: **Compose** → Name: `jitsi`
3. Paste this compose content:

```yaml
services:
  jitsi-web:
    image: jitsi/web:stable-9823
    ports:
      - "8443:443"
    environment:
      - ENABLE_AUTH=1
      - AUTH_TYPE=jwt
      - JWT_APP_ID=${JITSI_APP_ID}
      - JWT_APP_SECRET=${JITSI_JWT_SECRET}
      - JWT_ACCEPTED_ISSUERS=iqra-academy
      - JWT_ACCEPTED_AUDIENCES=jitsi
      - PUBLIC_URL=https://meet.learnnovice.com
      - XMPP_DOMAIN=meet.jitsi
      - XMPP_AUTH_DOMAIN=auth.meet.jitsi
      - XMPP_BOSH_URL_BASE=http://jitsi-prosody:5280
      - XMPP_MUC_DOMAIN=muc.meet.jitsi
    depends_on:
      - jitsi-prosody

  jitsi-prosody:
    image: jitsi/prosody:stable-9823
    environment:
      - ENABLE_AUTH=1
      - AUTH_TYPE=jwt
      - JWT_APP_ID=${JITSI_APP_ID}
      - JWT_APP_SECRET=${JITSI_JWT_SECRET}
      - JWT_ACCEPTED_ISSUERS=iqra-academy
      - JWT_ACCEPTED_AUDIENCES=jitsi
      - XMPP_DOMAIN=meet.jitsi
      - XMPP_AUTH_DOMAIN=auth.meet.jitsi
      - XMPP_MUC_DOMAIN=muc.meet.jitsi
      - XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi

  jitsi-jicofo:
    image: jitsi/jicofo:stable-9823
    environment:
      - ENABLE_AUTH=1
      - AUTH_TYPE=jwt
      - XMPP_DOMAIN=meet.jitsi
      - XMPP_AUTH_DOMAIN=auth.meet.jitsi
      - XMPP_MUC_DOMAIN=muc.meet.jitsi
      - XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi
      - XMPP_SERVER=jitsi-prosody
      - JICOFO_AUTH_USER=focus
      - JICOFO_AUTH_PASSWORD=${JICOFO_AUTH_PASSWORD}
    depends_on:
      - jitsi-prosody

  jitsi-jvb:
    image: jitsi/jvb:stable-9823
    ports:
      - "10000:10000/udp"
    environment:
      - XMPP_DOMAIN=meet.jitsi
      - XMPP_AUTH_DOMAIN=auth.meet.jitsi
      - XMPP_SERVER=jitsi-prosody
      - XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi
      - JVB_AUTH_USER=jvb
      - JVB_AUTH_PASSWORD=${JVB_AUTH_PASSWORD}
      - JVB_PORT=10000
      - JVB_STUN_SERVERS=meet-jit-si-turnrelay.jitsi.net:443
      - PUBLIC_URL=https://meet.learnnovice.com
    depends_on:
      - jitsi-prosody
```

### Environment Variables (in Dockploy):
```env
JITSI_APP_ID=iqra-academy
JITSI_JWT_SECRET=<generated-in-step-3>
JICOFO_AUTH_PASSWORD=<generated-in-step-3>
JVB_AUTH_PASSWORD=<generated-in-step-3>
```

### Domain:
Set `meet.learnnovice.com` → point to `jitsi-web` container, port `443`.

### Verify:
```
Visit: https://meet.learnnovice.com
Expected: Jitsi Meet welcome page (requires JWT to join rooms)
```

> **IMPORTANT:** Port `10000/udp` MUST be open in your VPS firewall!
> This is how video streams flow. Without it, calls will fail silently.
> ```bash
> # On your VPS:
> sudo ufw allow 10000/udp
> ```

---

## 6. Deploy Cal.com (Optional — Add Later)

### In Dokploy (same `iqra-academy` project):

1. Open your `iqra-academy` project
2. **Add Service** → Type: **Docker Image** → Name: `calcom`
3. Image: `calcom/cal.com:latest`
4. **Port mapping**: Container port `3000`

### Cal.com needs its own database:
You can either:
- **Option A**: Create a second database in Neon (recommended, easiest)
- **Option B**: Add a Postgres container (more maintenance)

For **Option A** (Neon):
1. Go to Neon → Create New Project → name it `calcom-db`
2. Copy the connection string

### Environment Variables (in Dockploy):
```env
DATABASE_URL=postgresql://user:pass@ep-xxx.aws.neon.tech/calcom?sslmode=require
DATABASE_DIRECT_URL=postgresql://user:pass@ep-xxx.aws.neon.tech/calcom?sslmode=require
NEXTAUTH_SECRET=<generated-in-step-3>
CALENDSO_ENCRYPTION_KEY=<generated-in-step-3>
NEXT_PUBLIC_WEBAPP_URL=https://cal.learnnovice.com
NEXT_PUBLIC_API_V2_URL=https://cal.learnnovice.com/api/v2
CALCOM_TELEMETRY_DISABLED=1
```

### Domain:
Set to `cal.learnnovice.com`, SSL enabled.

### Verify:
```
Visit: https://cal.learnnovice.com
Expected: Cal.com setup wizard (first-time configuration)
```

### Post-setup:
1. Create an admin account in Cal.com
2. Create teacher event types (30-minute sessions)
3. Go to Settings → Webhooks → Add webhook:
   - URL: `https://quran.learnnovice.com/api/webhooks/calcom`
   - Events: `BOOKING_CREATED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`
   - Secret: Use the same `CALCOM_WEBHOOK_SECRET` from Step 4

---

## 7. Deploy Twenty CRM (Optional — Add Later)

### In Dokploy (same `iqra-academy` project):

1. Open your `iqra-academy` project
2. **Add Service** → Type: **Compose** → Name: `crm`
3. Paste this compose:

```yaml
services:
  twenty-server:
    image: twentycrm/twenty:latest
    ports:
      - "3000:3000"
    environment:
      - PG_DATABASE_URL=postgres://twenty:${TWENTY_DB_PASSWORD}@twenty-db:5432/twenty
      - FRONT_BASE_URL=https://crm.learnnovice.com
      - SERVER_URL=https://crm.learnnovice.com
      - ACCESS_TOKEN_SECRET=${TWENTY_ACCESS_TOKEN_SECRET}
      - LOGIN_TOKEN_SECRET=${TWENTY_LOGIN_TOKEN_SECRET}
      - REFRESH_TOKEN_SECRET=${TWENTY_REFRESH_TOKEN_SECRET}
      - FILE_TOKEN_SECRET=${TWENTY_FILE_TOKEN_SECRET}
    depends_on:
      twenty-db:
        condition: service_healthy

  twenty-worker:
    image: twentycrm/twenty:latest
    command: ["node", "dist/src/queue-worker/queue-worker.module.js"]
    environment:
      - PG_DATABASE_URL=postgres://twenty:${TWENTY_DB_PASSWORD}@twenty-db:5432/twenty
      - ACCESS_TOKEN_SECRET=${TWENTY_ACCESS_TOKEN_SECRET}
      - LOGIN_TOKEN_SECRET=${TWENTY_LOGIN_TOKEN_SECRET}
      - REFRESH_TOKEN_SECRET=${TWENTY_REFRESH_TOKEN_SECRET}
      - FILE_TOKEN_SECRET=${TWENTY_FILE_TOKEN_SECRET}
    depends_on:
      twenty-db:
        condition: service_healthy

  twenty-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=twenty
      - POSTGRES_PASSWORD=${TWENTY_DB_PASSWORD}
      - POSTGRES_DB=twenty
    volumes:
      - twenty-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U twenty -d twenty"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  twenty-data:
```

### Environment Variables (in Dockploy):
```env
TWENTY_DB_PASSWORD=<generated-in-step-3>
TWENTY_ACCESS_TOKEN_SECRET=<generated-in-step-3>
TWENTY_LOGIN_TOKEN_SECRET=<generated-in-step-3>
TWENTY_REFRESH_TOKEN_SECRET=<generated-in-step-3>
TWENTY_FILE_TOKEN_SECRET=<generated-in-step-3>
```

### Domain:
Set `crm.learnnovice.com` → point to `twenty-server`, port `3000`.

### Verify:
```
Visit: https://crm.learnnovice.com
Expected: Twenty CRM signup/login page
```

### Post-setup:
1. Create your admin account
2. Go to Settings → API Keys → Create key
3. Copy the key to your Next.js app's `TWENTY_API_KEY` env var

---

## 8. Post-Deploy Checklist

After all 4 services are running, verify everything works together:

- [ ] `https://quran.learnnovice.com/api/health` → `{ "status": "ok" }`
- [ ] `https://quran.learnnovice.com/admin` → Admin panel loads
- [ ] `https://meet.learnnovice.com` → Jitsi welcome page
- [ ] `https://cal.learnnovice.com` → Cal.com UI
- [ ] `https://crm.learnnovice.com` → Twenty CRM login
- [ ] Google Sign-In works on the main app
- [ ] Port `10000/udp` is open (for Jitsi video)
- [ ] Push the Drizzle schema to Neon: `npm run db:push`
- [ ] Run the seed script: `npm run db:seed`
- [ ] Apply RLS policies: paste `rls-policies.sql` in Neon SQL Editor

### Stripe Webhook Setup:
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://quran.learnnovice.com/api/webhooks/stripe`
3. Select events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`
4. Copy webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

### Google OAuth Redirect URI:
Update your Google Cloud Console to add the production redirect:
```
https://quran.learnnovice.com/api/auth/callback/google
```

---

## 9. Troubleshooting

### Container won't start
```bash
# Check logs in Dockploy → Project → Logs
# Or on VPS:
docker logs <container-name> --tail 100
```

### Database connection refused
- Neon: Make sure your VPS IP is not blocked. Neon allows all IPs by default.
- Twenty DB: It runs inside Docker, so use `twenty-db:5432` (not localhost).

### Jitsi calls fail (no audio/video)
- **Check port 10000/udp** is open in your firewall
- **Check JVB logs**: `docker logs jitsi-jvb --tail 50`
- The JVB needs to know its public IP. If behind NAT, add:
  ```
  JVB_ADVERTISE_IPS=YOUR_VPS_PUBLIC_IP
  ```

### SSL certificate not provisioning
- DNS must point to VPS IP first (A records)
- Wait 5 minutes after DNS change
- Dockploy auto-provisions via Let's Encrypt; check Dockploy logs

### "502 Bad Gateway"
- Container is still starting. Wait 30 seconds.
- Check healthcheck: `docker inspect <container> | grep Health`

### Cal.com shows blank page
- Make sure `NEXT_PUBLIC_WEBAPP_URL` exactly matches your domain (include `https://`)
- Cal.com needs a database with the correct schema — it auto-migrates on first run

### Twenty CRM won't start
- `twenty-db` must be healthy first (check `docker logs twenty-db`)
- All 4 secret env vars must be set (ACCESS_TOKEN, LOGIN_TOKEN, REFRESH_TOKEN, FILE_TOKEN)
