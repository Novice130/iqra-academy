# Handoff Instructions for Incoming AI Session

All core bugs, virtual background optimizations, teacher availability 3D wheel selectors, production database migrations, and brand logo migrations have been **fully resolved, verified, committed, and deployed live to [novicetutor.com](https://novicetutor.com)**.

---

## ✅ Resolved & Live Status Summary

### 1. Virtual Background Optimization (BUG-002) — RESOLVED & LIVE
* **Fixed GPU Bottleneck**: Shared WebGL2 context between MediaPipe `ImageSegmenter` and custom shader pipeline (`glPipeline.ts`). Mask passed zero-copy via `mask.getAsWebGLTexture()`, dropping per-frame cost to <2ms.
* **CPU Fallback**: Direct byte view fallback via `mask.getAsUint8Array()`.
* **Resolution Floor**: 320px width floor breaks WebRTC downscaling loops under poor network conditions.

### 2. Teacher Availability UI & 3D Wheel Selector (BUG-007) — RESOLVED & LIVE
* **3D Gear Cylinder Time Selector**: Built custom interactive `TimeWheelPicker` with 3D perspective transforms (`rotateX`) and CSS scroll snapping (`snap-y snap-mandatory`).
* **Outer Margins & Alignment**: Added outer container padding (`p-6 sm:p-8 md:p-10 max-w-6xl mx-auto`), flex wrap responsiveness, center-aligned labels with icons (**`🔔 Start Time`** & **`🚪 End Time`**), and updated the button label to **`Everyday`**.

### 3. Production Database Migration (Digest: 962979961 Fix) — RESOLVED & LIVE
* Added missing `join_code` column and unique constraint to `sessions` table in the production Neon database (`ep-sparkling-dew`), resolving 500 server errors on logged-in dashboard routes.

### 4. Official Brand Logo & Icon Migration — RESOLVED & LIVE
* Replaced all brand logos and icon assets across the monorepo with the official olive tree design:
  * **Web**: `public/logo.png`, `public/logo.svg`, `src/app/favicon.ico`.
  * **Flutter Mobile**: `assets/images/logo.png`, `logo.svg`, Android launcher mipmaps, iOS AppIcon set.
  * **iOS Native**: Native Xcode AppIcon set (22 sizes).
  * **Desktop**: `icon.png`, `tray.png`, `tray@2x.png`.

---

## 🛠️ Verification & Build Commands
* **Build Check**: `npm run build` (inside `apps/web`)
* **DB Integration Check**: `npx tsx scripts/test-admin-and-availability.ts` (inside `apps/web`)
* **Deploy to Cloudflare Workers**: `npm run deploy:cf` (inside `apps/web`)
