# Jitsi → LiveKit Migration — Detailed Work Report

> **Status:** AWAITING APPROVAL
> **Date:** July 3, 2026
> **Scope:** Seamless migration from Jitsi (4 containers) to LiveKit (1 container + Redis)
> **Daily.co:** Preserved in a separate `daily-reference/` folder for future use

---

## Codebase Audit Summary

After auditing every file in the project, here's what the Jitsi integration looks like:

| Stat | Count |
|:---|:---|
| Files that reference Jitsi | **23 files** |
| Files requiring **code changes** | **8 files** |
| Files requiring **comment-only** updates | **5 files** |
| Files requiring **deletion/replacement** | **2 files** |
| Docker containers to remove | **4** (jitsi-web, prosody, jicofo, jvb) |
| Docker volumes to remove | **3** (jitsi-web-config, prosody-config, prosody-plugins) |
| New files to create | **7 files** |
| New packages to install | **3** (livekit-server-sdk, @livekit/components-react, livekit-client) |
| Database columns to rename | **2** (jitsiRoomName → videoRoomName, remove jitsiJwt) |

---

## Pre-Work: Copy Daily.co Reference

Before any migration work, create a reference copy for the Daily.co integration planned for later:

```
daily-reference/
├── README.md                     # Notes on how to use Daily.co later
├── daily-provider.ts             # Daily.co API wrapper (from IMPLEMENTATION_PLAN)
├── DailyRoom.tsx                 # Daily.co React component
└── daily-integration-notes.md    # API keys, features, pricing info
```

> This folder is reference-only — not imported by the app. We'll wire it up later when adding the provider abstraction.

---

## Change List — File by File

### 🔴 TIER 1: Core Jitsi Code (Must Replace)

---

#### Change 1: REPLACE `src/lib/jitsi.ts` → `src/lib/livekit.ts`

**Current file:** [jitsi.ts](file:///Users/abdulhannan/Documents/Important%20file/Phet-1/Quran%20learning/quran-lms/apps/web/src/lib/jitsi.ts) (179 lines)

**What it does now:**
- `generateJitsiJwt()` — Signs JWT with `jose` using JITSI_JWT_SECRET, includes room/moderator/user context
- `generateRoomName(sessionId)` — Returns `qlms-${sessionId}`
- `buildJitsiUrl(roomName, jwt)` — Returns `https://${JITSI_DOMAIN}/${roomName}?jwt=${jwt}`

**What it will become:** `src/lib/livekit.ts` — Drop-in replacement using LiveKit Server SDK

```diff
- import { SignJWT } from "jose";
+ import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

- const JITSI_CONFIG = {
-   domain: process.env.JITSI_DOMAIN || "meet.jitsi",
-   appId: process.env.JITSI_APP_ID || "quran-lms",
-   secret: process.env.JITSI_JWT_SECRET || "",
- };
+ const LIVEKIT_CONFIG = {
+   host: process.env.LIVEKIT_URL || "wss://meet.learnnovice.com",
+   apiKey: process.env.LIVEKIT_API_KEY || "",
+   apiSecret: process.env.LIVEKIT_API_SECRET || "",
+ };

- export interface JitsiRoomParams {
+ export interface LiveKitRoomParams {
    roomName: string;
    userName: string;
    userEmail: string;
    userAvatar?: string;
    isModerator: boolean;
    expiresInSeconds?: number;
  }

- export async function generateJitsiJwt(params): Promise<string>
+ export async function generateLiveKitToken(params): Promise<string>
  // Uses LiveKit AccessToken instead of jose SignJWT

  // generateRoomName() stays the same (qlms-${sessionId})

- export function buildJitsiUrl(roomName, jwt): string
+ export function buildLiveKitJoinUrl(roomName): string
  // Returns the app's own page URL: /dashboard/session/${roomName}
  // (LiveKit connects via SDK, not via external URL)
```

**Key difference:** Jitsi generates a URL to an external Jitsi web UI. LiveKit generates a token that's used by our own React component in-app. No more iframe/redirect.

**Can keep:** The `jose` library stays in package.json (used by Better Auth). The `generateRoomName()` function logic is identical.

---

#### Change 2: MODIFY `src/app/api/sessions/[id]/join/route.ts`

**Current file:** [join/route.ts](file:///Users/abdulhannan/Documents/Important%20file/Phet-1/Quran%20learning/quran-lms/apps/web/src/app/api/sessions/%5Bid%5D/join/route.ts) (71 lines)

**Lines that change:**

```diff
  // Line 2: Comment
- * @fileoverview Session Join API — generates Jitsi JWT for a session
+ * @fileoverview Session Join API — generates LiveKit token for a session

  // Line 5: Comment
- * GET /api/sessions/[id]/join — Get JWT to join the Jitsi room
+ * GET /api/sessions/[id]/join — Get token to join the LiveKit room

  // Line 14: Import
- import { generateJitsiJwt, generateRoomName, buildJitsiUrl } from "@/lib/jitsi";
+ import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";

  // Lines 46-51: Token generation
- const jwt = await generateJitsiJwt({
+ const token = await generateLiveKitToken({
    roomName,
    userName: user?.name || "Participant",
    userEmail: user?.email || "",
    isModerator: isTeacher,
  });

  // Lines 54-58: DB update
- if (!session.jitsiRoomName) {
+ if (!session.videoRoomName) {
    await db.update(sessions)
-     .set({ jitsiRoomName: roomName })
+     .set({ videoRoomName: roomName })
      .where(eq(sessions.id, sessionId));
  }

  // Lines 61-66: Response
  return NextResponse.json({
    roomName,
-   jwt,
-   joinUrl: buildJitsiUrl(roomName, jwt),
+   token,
+   serverUrl: process.env.LIVEKIT_URL,
+   provider: "livekit",
    isModerator: isTeacher,
  });
```

**Impact:** Response shape changes. Mobile app reads this response → needs updating too.

---

#### Change 3: MODIFY `src/app/api/teachers/call-now/route.ts`

**Current file:** [call-now/route.ts](file:///Users/abdulhannan/Documents/Important%20file/Phet-1/Quran%20learning/quran-lms/apps/web/src/app/api/teachers/call-now/route.ts) (90 lines)

**Lines that change:**

```diff
  // Line 16: Import
- import { generateJitsiJwt, generateRoomName, buildJitsiUrl } from "@/lib/jitsi";
+ import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";

  // Lines 47-54: Token generation
  const roomName = generateRoomName(sessionId);
- const studentJwt = await generateJitsiJwt({
+ const studentToken = await generateLiveKitToken({
    roomName,
    userName: student.name,
    userEmail: student.email,
    isModerator: false,
  });
- const joinUrl = buildJitsiUrl(roomName, studentJwt);
+ // Join URL is now our own app page, not an external Jitsi URL
+ const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/session/${sessionId}`;

  // Line 63: DB update
  await db.update(sessions).set({
-   jitsiRoomName: roomName,
+   videoRoomName: roomName,
    status: "IN_PROGRESS",
    actualStart: new Date(),
  })
```

**Impact:** The push notification `joinUrl` now points to our app (where the LiveKit component renders) instead of an external Jitsi URL. This is actually **better** — the student stays in our app.

---

### 🟠 TIER 2: Database Schema

---

#### Change 4: MODIFY `src/db/schema.ts` (lines 570-572)

**Current file:** [schema.ts](file:///Users/abdulhannan/Documents/Important%20file/Phet-1/Quran%20learning/quran-lms/apps/web/src/db/schema.ts) (1,187 lines)

**Lines that change:**

```diff
  // Lines 570-572
- // Jitsi integration
- jitsiRoomName: text("jitsi_room_name").unique(),
- jitsiJwt: text("jitsi_jwt"),
+ // Video integration (LiveKit)
+ videoRoomName: text("video_room_name").unique(),
+ // jitsiJwt removed — tokens are generated on-demand, never stored
```

**Database migration required:**

```sql
-- Migration: Rename Jitsi columns
ALTER TABLE sessions RENAME COLUMN jitsi_room_name TO video_room_name;
ALTER TABLE sessions DROP COLUMN jitsi_jwt;
```

> [!IMPORTANT]
> Run `npm run db:generate` then `npm run db:push` after this change. The `jitsiJwt` column was storing JWTs in the database which is unnecessary — tokens should be generated per-request and never persisted.

---

### 🟡 TIER 3: New Files to Create

---

#### Change 5: CREATE `src/lib/livekit.ts` (NEW — ~120 lines)

The LiveKit equivalent of `jitsi.ts`. Three exported functions with the same contract:

| Function | Input | Output |
|:---|:---|:---|
| `generateLiveKitToken(params)` | roomName, userName, userEmail, isModerator | JWT string (signed with LiveKit secret) |
| `generateRoomName(sessionId)` | session ID | `qlms-${sessionId}` (unchanged) |
| `buildLiveKitJoinUrl(roomName)` | room name | `/dashboard/session/${roomName}` |

Plus one new function:
| Function | Input | Output |
|:---|:---|:---|
| `createLiveKitRoom(roomName)` | room name | Room object (via RoomServiceClient) |

---

#### Change 6: CREATE `src/app/dashboard/session/[id]/page.tsx` (NEW — ~80 lines)

This page **does not exist yet** — the dashboard links to it (`/dashboard/session/${id}`) but it was never built. Currently it would 404.

**What it does:**
1. Calls `GET /api/sessions/[id]/join` to get a LiveKit token + serverUrl
2. Renders the `<LiveKitRoom />` component with the token
3. Shows a pre-join screen with camera/mic preview
4. Shows host controls for teachers (mute/kick/end call)

---

#### Change 7: CREATE `src/components/video/LiveKitRoom.tsx` (NEW — ~40 lines)

```tsx
import { LiveKitRoom, VideoConference, RoomAudioRenderer }
  from '@livekit/components-react';
import '@livekit/components-styles';

// Uses LiveKit's pre-built <VideoConference /> component
// which includes: video grid, screen share, chat, controls
```

---

#### Change 8: CREATE `src/components/video/PreJoinScreen.tsx` (NEW — ~60 lines)

Camera/mic preview + device selector shown before joining the room. Students and teachers see their own video before entering.

---

#### Change 9: CREATE `livekit.yaml` (NEW — in project root, ~20 lines)

LiveKit server configuration for self-hosted deployment.

---

### 🔵 TIER 4: Docker & Infrastructure

---

#### Change 10: MODIFY `docker-compose.yml` — Remove Jitsi, Add LiveKit

**Current:** 4 Jitsi containers (lines 113-201) + 3 Jitsi volumes (lines 305-310)
**After:** 1 LiveKit container + 1 Redis container

```diff
  # Lines 66-69: App env vars
- # ── Jitsi ──
- - JITSI_DOMAIN=meet.learnnovice.com
- - JITSI_APP_ID=${JITSI_APP_ID}
- - JITSI_JWT_SECRET=${JITSI_JWT_SECRET}
+ # ── LiveKit ──
+ - LIVEKIT_URL=wss://meet.learnnovice.com
+ - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
+ - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}

  # Lines 97-201: REMOVE all 4 Jitsi services, REPLACE with:
+ livekit:
+   image: livekit/livekit-server:latest
+   network_mode: host
+   volumes:
+     - ./livekit.yaml:/etc/livekit.yaml
+   command: --config /etc/livekit.yaml
+   restart: unless-stopped
+
+ redis:
+   image: redis:7-alpine
+   ports:
+     - "6379:6379"
+   volumes:
+     - redis-data:/data
+   restart: unless-stopped
+   networks:
+     - iqra-network

  # Lines 304-310: Volumes
- jitsi-web-config:
-   name: iqra-jitsi-web-config
- jitsi-prosody-config:
-   name: iqra-jitsi-prosody-config
- jitsi-prosody-plugins:
-   name: iqra-jitsi-prosody-plugins
+ redis-data:
+   name: iqra-redis-data
```

**Net result:** 4 containers → 2 containers. Simpler stack.

---

### 🟤 TIER 5: Environment & Config

---

#### Change 11: MODIFY `.env.example` (lines 42-49, 76-78)

```diff
- # ── JITSI (Video Conferencing) ───────────────────────────────────────────────
- JITSI_DOMAIN="meet.learnnovice.com"
- JITSI_APP_ID="iqra-academy"
- JITSI_JWT_SECRET="your-jitsi-jwt-secret-at-least-32-chars"
+ # ── LIVEKIT (Video Conferencing) ─────────────────────────────────────────────
+ # Self-hosted LiveKit server URL (WebSocket)
+ LIVEKIT_URL="wss://meet.learnnovice.com"
+ # Generate with: docker run --rm livekit/generate
+ LIVEKIT_API_KEY="your-livekit-api-key"
+ LIVEKIT_API_SECRET="your-livekit-api-secret"

  # Lines 76-78: Docker secrets
- JICOFO_AUTH_PASSWORD="generated-hex-16"
- JVB_AUTH_PASSWORD="generated-hex-16"
+ # (Jitsi secrets removed — no longer needed)
```

---

#### Change 12: UPDATE `.env` (actual secrets)

Replace Jitsi env vars with LiveKit env vars. The LiveKit API key/secret will be generated when we deploy the LiveKit server.

---

#### Change 13: UPDATE `package.json` — Add LiveKit packages

```diff
  "dependencies": {
+   "@livekit/components-react": "^2.x.x",
+   "livekit-client": "^2.x.x",
+   "livekit-server-sdk": "^2.x.x",
    "jose": "^6.1.3",        // keep — used by Better Auth too
    ...
  }
```

```diff
  "devDependencies": {
+   "@livekit/components-styles": "^1.x.x",
    ...
  }
```

---

### 🟣 TIER 6: Mobile App

---

#### Change 14: MODIFY `apps/mobile/lib/screens/session/live_session_screen.dart`

**Current file:** [live_session_screen.dart](file:///Users/abdulhannan/Documents/Important%20file/Phet-1/Quran%20learning/quran-lms/apps/mobile/lib/screens/session/live_session_screen.dart) (190 lines)

The mobile app uses WebView to load the Jitsi URL. For the migration, the **simplest** approach is to keep WebView but point it at our own app page instead:

```diff
  // Line 1: Comment
- /// Live Session Screen — Jitsi video call via WebView
+ /// Live Session Screen — LiveKit video call via WebView

  // Line 32: Variable name
- String? _jitsiUrl;
+ String? _sessionUrl;

  // Line 51: Response field
- _jitsiUrl = response.data['jitsiUrl'];
+ _sessionUrl = response.data['joinUrl'];
+ // joinUrl now points to our own app: /dashboard/session/{id}
+ // The LiveKit room renders in our React app via WebView

  // Line 167: WebView URL
- if (_jitsiUrl != null) {
-   return InAppWebView(
-     initialUrlRequest: URLRequest(url: WebUri(_jitsiUrl!)),
+ if (_sessionUrl != null) {
+   return InAppWebView(
+     initialUrlRequest: URLRequest(url: WebUri(_sessionUrl!)),
```

**Future upgrade:** Replace WebView with `livekit_client` Flutter package for native video. But WebView works fine for now and is zero-risk.

---

### 📖 TIER 7: Documentation (Comment-Only Updates)

---

#### Change 15: UPDATE `src/lib/email.ts` (line 110)

```diff
- * @param joinUrl - URL to join the Jitsi room
+ * @param joinUrl - URL to join the video room
```

#### Change 16: UPDATE `src/lib/push.ts` (lines 122, 131)

```diff
- // Student clicks the notification → opens the Jitsi room
+ // Student clicks the notification → opens the video room

- * @param joinUrl - URL to join the Jitsi room
+ * @param joinUrl - URL to join the video room
```

#### Change 17: REPLACE `docs/integration-jitsi.md` → `docs/integration-livekit.md`

Replace the entire 58-line Jitsi integration guide with a LiveKit guide covering:
- Self-hosting setup
- Token generation
- Room lifecycle
- Recording with Egress API

#### Change 18: UPDATE `docs/deployment-dockploy.md` (lines 159-257)

Replace the ~100-line Jitsi deployment section with LiveKit deployment instructions.

#### Change 19: UPDATE `README.md` (~20 Jitsi references)

Find/replace all mentions of "Jitsi" with "LiveKit" and update architectural descriptions.

---

## Execution Order

| Step | Task | Files | Risk |
|:---|:---|:---|:---|
| **0** | Create `daily-reference/` folder with Daily.co code | New folder | None |
| **1** | Install LiveKit npm packages | `package.json` | None |
| **2** | Create `src/lib/livekit.ts` | New file | None |
| **3** | Update DB schema (rename columns) | `schema.ts` | ⚠️ Requires migration |
| **4** | Run `db:generate` + `db:push` | CLI | ⚠️ DB migration |
| **5** | Update session join API route | `sessions/[id]/join/route.ts` | 🔴 API response changes |
| **6** | Update call-now API route | `teachers/call-now/route.ts` | 🔴 API response changes |
| **7** | Create LiveKit room component | `components/video/LiveKitRoom.tsx` | None |
| **8** | Create pre-join screen | `components/video/PreJoinScreen.tsx` | None |
| **9** | Create session page | `dashboard/session/[id]/page.tsx` | None |
| **10** | Delete `src/lib/jitsi.ts` | Deletion | None (replaced in step 2) |
| **11** | Update docker-compose.yml | `docker-compose.yml` | ⚠️ Infra change |
| **12** | Create `livekit.yaml` config | New file | None |
| **13** | Update `.env.example` + `.env` | Config files | None |
| **14** | Update mobile app | `live_session_screen.dart` | Minor |
| **15** | Update comments (email, push) | `email.ts`, `push.ts` | None |
| **16** | Update docs | `README.md`, docs/ | None |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|:---|:---|:---|
| DB migration breaks existing sessions | 🟠 Medium | Column rename only — data preserved. Run during off-hours. |
| Mobile app breaks on new response shape | 🟡 Low | WebView approach is backward-compatible — just URL changes. |
| LiveKit Docker container won't start | 🟡 Low | Well-documented, single binary. `network_mode: host` is the key config. |
| Students can't connect (NAT/firewall) | 🟡 Low | LiveKit has built-in TURN server (unlike Jitsi which needs separate STUN config). |
| Existing scheduled sessions lose room names | 🟢 None | Column rename preserves data. `qlms-` prefix format stays identical. |

---

## What Stays the Same (No Changes)

| File | Why |
|:---|:---|
| `src/app/api/sessions/[id]/recording/route.ts` | No Jitsi imports — manages recording URLs generically |
| `src/app/api/sessions/[id]/extend/route.ts` | No Jitsi imports — time extension logic is provider-agnostic |
| `src/lib/audit.ts` | No Jitsi references |
| `src/app/dashboard/schedule/page.tsx` | No video logic |
| `src/app/dashboard/booking/page.tsx` | No video logic |
| `src/app/dashboard/layout.tsx` | No video logic |
| `src/lib/auth.ts`, `rbac.ts`, `stripe.ts`, etc. | No video logic |
| `apps/mobile/lib/config/api_config.dart` | Endpoint path unchanged — `/api/sessions/$id/join` |
| `apps/mobile/lib/config/routes.dart` | Import path unchanged |

---

## Summary

**Total effort: ~1-2 days of focused work**

- **6 files modified** (meaningful code changes)
- **5 new files created** (livekit.ts, LiveKitRoom.tsx, PreJoinScreen.tsx, session page, livekit.yaml)
- **1 file deleted** (jitsi.ts)
- **4 Docker containers removed** → 2 added (net: 2 fewer containers)
- **5 files comment-only** updates
- **3 docs** updated

The migration is clean because:
1. Jitsi integration is **well-isolated** — only 2 API routes import from `jitsi.ts`
2. The `generateRoomName()` pattern is identical for LiveKit
3. The mobile app uses WebView (just change the URL field name)
4. No Jitsi SDK was installed (no `@jitsi/react-sdk` to remove)
5. The `jose` library stays (used by Better Auth, not just Jitsi)

**Awaiting your approval to proceed.**
