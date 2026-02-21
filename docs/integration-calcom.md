# Cal.com Integration Guide

## Overview
Cal.com handles scheduling (time slots, recurring events, timezone conversion).
We self-host Cal.com and receive webhooks when bookings are created/cancelled.

## Self-Hosting Cal.com with Dockploy

1. Add Cal.com as a separate service in Dockploy
2. Use the official Docker image: `calcom/cal.com:latest`
3. Set up a Postgres database for Cal.com (separate from the LMS database)
4. Configure the domain: `cal.yourschool.com`

## Event Types to Create

In Cal.com admin, create these event types:

| Event Type | Duration | Max Attendees | Maps To |
|-----------|----------|---------------|---------|
| 1:1 Quran Lesson | 30 min | 1 | `INDIVIDUAL` |
| Group Quran Lesson | 30 min | 3 | `GROUP` |
| Free Webinar | 30 min | 20 | `WEBINAR` |

## Webhook Configuration

1. Cal.com → Settings → Developer → Webhooks
2. URL: `https://yourapp.com/api/webhooks/calcom`
3. Events: `BOOKING_CREATED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`
4. Set the webhook secret → copy to `CALCOM_WEBHOOK_SECRET` in `.env`

## Booking Metadata

When creating bookings via Cal.com API, include metadata:
```json
{
  "metadata": {
    "orgId": "clk2m1x0z",
    "userId": "clk2m2abc",
    "sessionType": "INDIVIDUAL"
  }
}
```

This metadata is forwarded in webhooks so we know which org/user the booking belongs to.

## Default Weekly Slot Flow
1. Student picks a recurring time (e.g., "every Monday at 3pm")
2. Cal.com creates recurring bookings automatically
3. Each booking triggers a `BOOKING_CREATED` webhook
4. Our handler creates a Session + consumes a quota slot per booking
