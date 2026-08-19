# Secret Rotation Checklist

A security review found live production credentials in `apps/web/.env` and
`.env.bak-jitsi-cleanup` (deleted) plus SSH passwords in the repo-root expect
scripts (now env-var driven). Everything below must be rotated, because copies
of these files may exist on other machines.

Do this in order, and update `apps/web/.env` with the new values as you go.

## 1. SSH server (iqra@192.168.0.186)

- [ ] Change the `iqra` user's password (the old one was in git-tracked scripts)
- [ ] Generate an SSH keypair and add the public key to `~/.ssh/authorized_keys`
- [ ] In `/etc/ssh/sshd_config`: `PasswordAuthentication no` (after confirming key login works)
- [ ] Restart sshd

## 2. Database (Neon)

- [ ] Neon console → the `neondb` project → reset the `neondb_owner` password
- [ ] Update `DATABASE_URL` everywhere (app env, local `.env`)

## 3. Better Auth

- [ ] `openssl rand -base64 32` → new `BETTER_AUTH_SECRET`
- [ ] Deploy; this force-logs-out every user (old sessions won't validate)

## 4. LiveKit Cloud

- [ ] LiveKit Cloud → project → Settings → rotate API key / secret
- [ ] Update `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`; both the app and the
      LiveKit webhook receiver use them.

## 5. Google OAuth

- [ ] Google Cloud console → the OAuth client → reset the client secret
- [ ] Update `GOOGLE_CLIENT_SECRET`

## 6. Firebase / FCM service account

- [ ] Firebase console → project `fir-auth-d4f03` → Service accounts →
      new key for `firebase-adminsdk-fbsvc` → replace `FCM_PRIVATE_KEY`
- [ ] Delete the old key in the same screen

## 7. VAPID (web push)

- [ ] `npx web-push generate-vapid-keys` → new public/private pair
- [ ] Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
- [ ] Note: browsers keep old subscriptions; pushes will fail 404/410 on old
      endpoints until users re-subscribe (the code prunes dead endpoints)

## 8. Resend

- [ ] Resend dashboard → rotate the API key → new `RESEND_API_KEY`

## 9. Stripe

- [ ] Stripe dashboard → API keys → roll the restricted secret key
- [ ] Stripe dashboard → Webhooks → roll `STRIPE_WEBHOOK_SECRET`
- [ ] Update both in env

## 10. Cal.com webhook

- [ ] `openssl rand -hex 32` → new `CALCOM_WEBHOOK_SECRET`
- [ ] Update the Cal.com webhook endpoint config on their dashboard

## 11. Accounts created by `scripts/create-users.ts` (deleted)

That script seeded real Gmail accounts with a committed password. Reset them:

- [ ] syedamer130@gmail.com (SUPER_ADMIN — keep the role, change the password)
- [ ] masadshareef1973@gmail.com
- [ ] subedar2017info@gmail.com
- [ ] bkyt@test.com / sobur@test.com / malek@test.com

## Done when

- `apps/web/.env` contains only fresh values
- No git-tracked file contains a password, private key, or `re_`/`API` secret
  (`grep -rE "PRIVATE KEY|password|secret" --exclude-dir=node_modules --exclude-dir=.git .`)
