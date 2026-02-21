# Jitsi Integration Guide

## Overview
Jitsi provides JWT-secured video rooms for live Quran sessions.
Teachers are moderators; students are participants.

## Self-Hosting Jitsi

### Option 1: Docker (recommended for Dockploy)
```bash
git clone https://github.com/jitsi/docker-jitsi-meet
cd docker-jitsi-meet
cp env.example .env
# Edit .env to enable JWT auth
```

### Key Jitsi `.env` Settings
```env
ENABLE_AUTH=1
AUTH_TYPE=jwt
JWT_APP_ID=quran-lms          # Must match JITSI_APP_ID
JWT_APP_SECRET=your-secret    # Must match JITSI_JWT_SECRET
JWT_ACCEPTED_ISSUERS=quran-lms
JWT_ACCEPTED_AUDIENCES=quran-lms
```

## JWT Token Structure
Our app generates JWTs with these claims:
```json
{
  "iss": "quran-lms",
  "sub": "meet.yourschool.com",
  "room": "qlms-clk2m1x0z",
  "moderator": true,
  "context": {
    "user": { "name": "Teacher Name", "email": "teacher@school.com" },
    "features": { "recording": true, "screen-sharing": true }
  },
  "exp": 1234567890
}
```

## Moderator vs Participant Permissions
| Feature | Teacher (Moderator) | Student (Participant) |
|---------|-------------------|---------------------|
| Mute others | ✅ | ❌ |
| Kick participants | ✅ | ❌ |
| Start recording | ✅ | ❌ |
| Screen share | ✅ | ✅ |
| Chat | ✅ | Depends on plan |

## "Call Now" Flow
1. Teacher clicks "Call Now" → `POST /api/teachers/call-now`
2. Server generates Jitsi JWT for the student
3. Server sends Web Push notification with join URL
4. Student clicks notification → opens Jitsi with JWT
5. Both teacher and student are in the room
