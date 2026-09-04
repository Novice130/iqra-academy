# 🎙️ Virtual Classroom & Meeting Controls Specification

**Project**: NoviceTutor / Iqra Academy Virtual Classroom  
**Status**: Canonical Source of Truth (Post-Remediation)  
**Last Updated**: 2026-09-05  

---

## 1. Virtual Stage & Canvas Geometry

The virtual classroom mounts at `/dashboard/session/[id]` as an immersive, zero-chrome fullscreen canvas.

```
┌─────────────────────────────────────────────────────────────┐
│                      [ Layout Switcher ]                    │
│                                                             │
│                                                             │
│                      Main Video Stage                       │
│                     (Teacher / Spotlight)                   │
│                                                             │
│                     [ 3-Button Center Pill ]                │
│                                                             │
│    ┌──────────────┐  ┌──────────────┐                       │
│    │ Floating     │  │ Floating     │                       │
│    │ Student 1    │  │ Student 2    │                       │
│    └──────────────┘  └──────────────┘                       │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Mute  Video  People  Chat  React  Share  Host  More End │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Visual Elements & Canvas Rules
- **Apple visionOS Frosted Glass**: Control bar and floating pills use dual specular highlights (`inset 0 1px 0 0 rgba(255, 255, 255, 0.40)`), high saturation blur (`backdrop-filter: blur(32px) saturate(200%)`), and 22px corner radii.
- **Top-Center Layout Switcher**: Positioned at `top: 16px, left: 50%` with full pointer and touch dragging, viewport boundary clamping, and dropdown toggling between Speaker, Gallery, and Active Speaker views.
- **Center 3-Button Action Pill**: Floats over the center video stage (auto-hides after 3.5s of inactivity):
  1. *Button 1*: Reframe Video (`FramePersonIcon` — toggles `contain` vs `cover`).
  2. *Button 2*: Visual Effects (`VisualEffectsSparkleIcon` — toggles background replacement palette).
  3. *Button 3*: More Options (`MoreIcon` — 3-dot dropdown for framing, visual effects, and pin).
- **Floating Student Tiles**: Enforces `bottomClearance: 96px` above the bottom dock. Includes magnetic snapping to adjacent tiles (12px gap) and synchronized lift when the bottom dock becomes active.
- **Mobile Swipe-Back Protection**: Handled by `usePreventBackNavigation()` with `popstate` event trapping. Prevents accidental class exit on mobile devices; leaving requires tapping the red End button.
- **WebGL Background Segmentation**: Inputs are pre-scaled to $256 \times 144$ with a 85% EMA temporal blend (`temporalBlend = 0.15`) and cubic noise-rejection gate, eliminating jitter and CPU audio lag on low-end hardware.

---

## 2. Bottom Control Dock Placement

### 2.1 Desktop Dock ($\ge 768$px)
The desktop control bar renders 9 canonical positions from left to right:

| Position | Control | Icon / Indicator | Behavior |
|:---:|---|---|---|
| **1** | **Mute** | Mic icon + split caret | Toggles microphone; caret opens frosted glass audio input device picker. |
| **2** | **Video** | Camera icon + split caret | Toggles video track; caret opens video input camera picker. |
| **3** | **Participants** | Two-people icon + count | Opens `PeoplePanel` roster with participant speaking, mute, and hand states. |
| **4** | **Chat** | Speech bubble + badge | Toggles in-class chat sidebar with unread message counter. |
| **5** | **Reactions** | Smiley emoji icon | Opens reaction emoji selector (👍, 👏, ❤️, 🎉, 😂, 🤲) and `✋ Hand Raise` toggle. |
| **6** | **Share** | Screen share monitor | Starts screen share (active state highlighted in green). |
| **7** | **Host Tools** | Shield icon (*host only*) | Opens `HostToolsModal` for room moderation. Strictly hidden for students. |
| **8** | **More** | 3-dot horizontal ellipsis | Opens secondary tools popover (Captions, Whiteboard, Settings, Bandwidth). |
| **9** | **End** | Red pill button | Rightmost button. Students leave; assigned teachers choose Leave vs End for Everyone. |

### 2.2 Mobile Compact Dock ($< 768$px)
To preserve comfortable touch targets on mobile viewports, the visible dock collapses to **5 primary buttons**:
1. **Mute** (Microphone toggle)
2. **Video** (Camera toggle)
3. **Share** (Screen share toggle — Android only; hidden on iOS)
4. **More** (Opens full grouped overflow bottom sheet)
5. **End** (Leave / End call button)

#### Mobile "More" Sheet Grouping:
- **Host Tools Section** (rendered at top for assigned teachers): Mute All, Lock Meeting, Share Permissions, End Class for Everyone.
- **Collaboration Section**: Participants (with counter), Chat (with unread badge), Reactions & Hand Raise.
- **In-Call Tools Section**: Captions, Whiteboard, Virtual Backgrounds, Stop Incoming Video, Call Settings, Meeting Info.

---

## 3. Working Feature Definitions

### 3.1 Device Selectors
- Split-button carets on Mute and Video trigger frosted glass device menus.
- Supports hot-swapping between microphones, cameras, and audio output speakers without reconnecting or dropping the call.

### 3.2 LiveKit Data Channel Reactions & Hand Raising
- **Topics**: `reaction` and `hand_raise`.
- Sent/received reactions animate upward from the dock (`animate-float-reaction`) and display over the participant's video tile.
- Hand raising persists until lowered by the student or lowered by the host; renders a golden `✋ Hand Raised` badge on the tile and in the roster.

### 3.3 Platform-Gated Screen Sharing
- **Browser**: Standard `navigator.mediaDevices.getDisplayMedia`.
- **Android Native Shell**: Bridges to native MediaProjection foreground service via `NoviceTutorApp/1.2 (screenshare)` user agent marker.
- **iOS Native Shell**: Strictly hidden (`nativeScreenShareSupported = false`) until an iOS Broadcast Upload Extension and ReplayKit bridge is introduced, preventing dead taps.
- **Policy Control**: Host can toggle `allowParticipantShare` via Host Tools.

### 3.4 Host Moderation Tools (`HostToolsModal.tsx`)
Backed by `/api/sessions/[id]/host-tools` requiring assigned teacher or admin RBAC:
1. **Mute All**: Sends room-wide data message muting remote participant audio tracks.
2. **Lock Meeting**: Updates room metadata (`isLocked: true`). Rejects new guest knocks with `423 Locked`.
3. **Student Screen Sharing Toggle**: Enables or disables remote participant display capture.
4. **End Class for Everyone**: Broadcasts `CLASS_ENDED`, records exit timestamps in `session_attendance`, closes room, and redirects all participants.

### 3.5 Interactive Quran Teaching Whiteboard (`WhiteboardOverlay.tsx`)
- Full-stage digital whiteboard for Arabic script, Tajweed diagrams, and lesson notes.
- Tools: Smooth pen, eraser, color palette (black, blue, red, green, gold), stroke width selector, and 1-click canvas clearing.
- Persisted and tenant-isolated in `whiteboards` table.

### 3.6 Live Captions & Bandwidth Saver
- **Live Captions**: Real-time speech transcription banner identifying active speakers.
- **Stop Incoming Video**: Unsubscribes remote video tracks locally while preserving crisp Web Audio streams, ideal for low-bandwidth environments.

### 3.7 Room-Wide Volume Gain Control
- **Strict Authority**: Exclusively accessible to the assigned teacher.
- Teacher slider modifies participant audio gain map in room metadata.
- Every client applies the multiplier via Web Audio API nodes (`createGain()`), ensuring balanced volume across all students.
