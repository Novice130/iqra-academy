# LiveKit Integration Guide

This guide explains how LiveKit is integrated into the Quran LMS project for secure, low-latency video conferencing.

## Architecture

- **LiveKit Server:** A single-instance Go-based Selective Forwarding Unit (SFU) running on your home server in a Docker container. It coordinates and routes video/audio streams.
- **Redis:** Used by LiveKit for internal coordination and room state management.
- **Client (Web):** Integrates `@livekit/components-react` and `livekit-client` in Next.js to provide native, fully featured call UIs.
- **Client (Mobile):** Loads the Next.js call page `/dashboard/session/[id]` in an `InAppWebView` to leverage the web implementation directly.

## Token Generation

Security is enforced using token-based access. When a user requests to join a class, `/api/sessions/[id]/join` dynamically issues a JWT signed with the LiveKit API Secret containing:
- Participant identity (email or unique username)
- Participant display name
- Room join grant
- Permissions (e.g. `isModerator` is true for teachers)

Tokens expire automatically after 2 hours.
