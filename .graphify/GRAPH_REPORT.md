# Graph Report - .  (2026-08-04)

## Corpus Check
- 134 files · ~92,251 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 536 nodes · 1223 edges · 43 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 384 · imports: 292 · MODIFIES: 206 · imports_from: 181 · references: 54 · ON_BRANCH: 34 · PARENT_OF: 33 · calls: 25 · method: 10 · inherits: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 134 · Candidates: 168
- Excluded: 113 untracked · 84246 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `6bd808e`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 47 edges
2. `users` - 28 edges
3. `handleApiError()` - 22 edges
4. `sessions` - 20 edges
5. `requireRole()` - 20 edges
6. `public.users` - 19 edges
7. `public.organizations` - 17 edges
8. `studentProfiles` - 16 edges
9. `bookings` - 16 edges
10. `NotFoundError` - 13 edges

## Surprising Connections (you probably didn't know these)
- `2dd1542 Fix TypeScript build error and deploy latest worker` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 1 → community 4_
- `343f92b Checkpoint from VS Code for cloud agent session` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 20 → community 4_
- `6765997 feat: Add @neondatabase/serverless driver for Cloudflare Workers, update LiveKit Cloud config, fix mobile login button` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 5 → community 4_
- `8622df6 feat: migrate Jitsi to self-hosted LiveKit and set up Daily.co references` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 7 → community 4_
- `8622df6 feat: migrate Jitsi to self-hosted LiveKit and set up Daily.co references` --PARENT_OF--> `6765997 feat: Add @neondatabase/serverless driver for Cloudflare Workers, update LiveKit Cloud config, fix mobile login button`  [EXTRACTED]
  git → git  _Bridges community 7 → community 5_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (35): bookingSchema, createCouponSchema, chatMessages, sessions, extendSchema, feedbackSchema, impersonateSchema, AuditAction (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (18): { GET, POST }, 2dd1542 Fix TypeScript build error and deploy latest worker, 6bd808e Fix admin dashboard redirect, purge fake data, assign class to Masad Shareef, add admin student assignment, bookings, entitlements, lessonContent, progressRecords, studentProfiles (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (47): auditActionEnum, auditLogs, auditLogsRelations, bookingsRelations, bookingStatusEnum, chatMessagesRelations, chatModerationActions, chatModerationActionsRelations (+39 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (38): accounts, audit_logs, auth_sessions, bookings, chat_messages, chat_moderation_actions, chat_rooms, coupon_redemptions (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (31): master, 024609b fix: use better-auth client for login/register redirects and add logo file, 0f09475 fix: revert build script to next build to prevent OpenNext infinite build loop, 0fdd936 fix: login page styling + google oauth sign-in, 12c3a66 main website, 1abd235 fix: add dummy API keys for Stripe/Resend/Google in Dockerfile, 2e97a9c Initial commit from Create Next App, 2ebb4d5 docs: Update deployment documentation for Cloudflare Workers & LiveKit Cloud (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (14): callNowSchema, 6765997 feat: Add @neondatabase/serverless driver for Cloudflare Workers, update LiveKit Cloud config, fix mobile login button, users, generateLiveKitToken(), generateRoomName(), LIVEKIT_CONFIG, LiveKitRoomParams, sendCallNowNotification() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (19): getResend(), sendPaymentReceipt(), sendSessionReminder(), sendWeeklyDigest(), sendWelcomeEmail(), createAutoChargeSubscription(), createManualInvoiceSubscription(), createStripeCoupon() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (1): 8622df6 feat: migrate Jitsi to self-hosted LiveKit and set up Daily.co references

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (7): accounts, chatRooms, defaultWeeklySlots, organizations, subscriptions, teacherAvailability, accountsToCreate

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (1): metadata

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (3): Message, b095279 Ignore monorepo node_modules and Flutter build files, authClient

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (5): CreateRoomOptions, DailyVideoProvider, JoinToken, TokenOptionsDaily, VideoRoom

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (8): handleBookingCancelled(), handleBookingCreated(), handleBookingRescheduled(), POST(), CalcomWebhookEvent, CalcomWebhookPayload, mapCalcomEventType(), verifyCalcomWebhook()

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (3): ChatScreen, _ChatScreenState, _MessageBubble

### Community 14 - "Community 14"
Cohesion: 0.31
Nodes (8): crmSyncEvents, CRM_CONFIG, CrmContactData, CrmDealData, syncCancellationToCRM(), syncContactToCRM(), syncDelinquencyToCRM(), twentyRequest()

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (1): ApiClient

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (2): LiveKitRoomProps, PreJoinScreenProps

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (6): adminBranding, adminMeta, adminResources, canAccessAdmin(), AdminPage(), getTableCounts()

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (2): AuthNotifier, AuthState

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (3): geistMono, geistSans, metadata

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (3): 343f92b Checkpoint from VS Code for cloud agent session, IqraTheme, IqraAcademyApp

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (2): LoginScreen, _LoginScreenState

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (5): _ChildProfileCard, DashboardScreen, _NextClassCard, _QuickActionButton, _QuotaCard

### Community 23 - "Community 23"
Cohesion: 0.40
Nodes (2): RegisterScreen, _RegisterScreenState

### Community 24 - "Community 24"
Cohesion: 0.40
Nodes (1): FadeInOnScrollProps

### Community 25 - "Community 25"
Cohesion: 0.40
Nodes (1): authSessions

### Community 26 - "Community 26"
Cohesion: 0.40
Nodes (2): observerEmails, observerSchema

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (2): LiveSessionScreen, _LiveSessionScreenState

### Community 28 - "Community 28"
Cohesion: 0.50
Nodes (2): DAYS, SLOTS

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (2): invoices, plans

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (2): BookingScreen, _BookingScreenState

### Community 31 - "Community 31"
Cohesion: 0.50
Nodes (2): SLOTS, TRACKS

### Community 32 - "Community 32"
Cohesion: 0.50
Nodes (1): ApiConfig

### Community 33 - "Community 33"
Cohesion: 0.50
Nodes (1): MainShell

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (1): DailyRoomProps

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (1): metadata

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (2): StudentNotifier, StudentState

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): _SectionHeader, _SettingsItem, SettingsScreen

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (1): metadata

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (1): FAQS

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (1): config

### Community 41 - "Community 41"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 42 - "Community 42"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **141 isolated node(s):** `IqraAcademyApp`, `ApiConfig`, `MainShell`, `IqraTheme`, `StudentState` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 7`** (1 nodes): `8622df6 feat: migrate Jitsi to self-hosted LiveKit and set up Daily.co references`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (1 nodes): `metadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `LiveKitRoomProps`, `PreJoinScreenProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `AuthNotifier`, `AuthState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `LoginScreen`, `_LoginScreenState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `RegisterScreen`, `_RegisterScreenState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `FadeInOnScrollProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `authSessions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `observerEmails`, `observerSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `LiveSessionScreen`, `_LiveSessionScreenState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `DAYS`, `SLOTS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `invoices`, `plans`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `BookingScreen`, `_BookingScreenState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `SLOTS`, `TRACKS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `ApiConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `MainShell`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `DailyRoomProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `metadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `StudentNotifier`, `StudentState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `metadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `FAQS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 0` to `Community 7`, `Community 29`, `Community 12`, `Community 5`, `Community 1`, `Community 8`, `Community 14`, `Community 26`, `Community 17`, `Community 6`, `Community 25`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `users` connect `Community 5` to `Community 7`, `Community 0`, `Community 12`, `Community 1`, `Community 2`, `Community 8`, `Community 17`, `Community 25`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `IqraAcademyApp`, `ApiConfig`, `MainShell` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.060867293625914316 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06377551020408163 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1241565452091768 - nodes in this community are weakly interconnected._