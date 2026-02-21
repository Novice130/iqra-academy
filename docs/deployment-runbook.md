# Deployment Runbook — Staging → Production

## Prerequisites
- VPS with Docker installed (or Dockploy set up)
- Neon Postgres database created
- Domain pointed to your VPS (A record)
- Stripe, Resend, Jitsi, Cal.com accounts set up

---

## Step 1: Staging Deployment

### 1.1 Clone and Configure
```bash
git clone https://github.com/your-org/quran-lms.git
cd quran-lms
cp .env.example .env
# Edit .env with STAGING values (use Stripe test keys!)
```

### 1.2 Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Push schema to staging database
npx prisma db push

# (Optional) Seed with test data
npx prisma db seed
```

### 1.3 Docker Build + Deploy via Dockploy
1. In Dockploy, create a new project → import from Git
2. Set environment variables from `.env`
3. Build command: (Dockploy uses the Dockerfile automatically)
4. Domain: `staging.yourschool.com`
5. Deploy

### 1.4 Verify Staging
- [ ] App loads at staging URL
- [ ] Health endpoint returns OK: `curl https://staging.yourschool.com/api/health`
- [ ] Stripe webhooks are received (check Stripe Dashboard → Webhooks → Events)
- [ ] Cal.com can be accessed and bookings trigger webhooks
- [ ] Jitsi rooms work with JWT

---

## Step 2: Production Deployment

### 2.1 Switch to Production Credentials
Update `.env` with:
- `NODE_ENV=production`
- Stripe **live** keys (sk_live_..., pk_live_...)
- Production database URL
- Production domain in `NEXT_PUBLIC_APP_URL`

### 2.2 Database Migration
```bash
# Create a migration from your schema
npx prisma migrate dev --name init

# In production, apply migrations:
npx prisma migrate deploy
```

### 2.3 Deploy to Production
1. In Dockploy, create production project or promote staging
2. Update all env vars to production values
3. Set domain: `app.yourschool.com`
4. Enable HTTPS (Dockploy handles Let's Encrypt)
5. Deploy

### 2.4 Post-Deploy Checklist
- [ ] Production app loads with HTTPS
- [ ] Stripe live webhooks configured and working
- [ ] First test user can sign up and receive welcome email
- [ ] Manual invoice flow works end-to-end
- [ ] Jitsi rooms accessible with JWT
- [ ] Push notifications deliver on Chrome/Firefox
- [ ] Cal.com bookings create sessions in our DB

---

## Rollback Procedure
1. In Dockploy, redeploy the previous build
2. If DB migration caused issues: `npx prisma migrate resolve --rolled-back MIGRATION_NAME`
3. Monitor logs: `dockploy logs app --follow`

## Monitoring
- Set up uptime monitoring on `/api/health`
- Enable Stripe webhook failure alerts in Dashboard
- Check Neon dashboard for connection pool usage
