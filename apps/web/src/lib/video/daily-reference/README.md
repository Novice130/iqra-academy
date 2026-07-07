# Daily.co Integration Reference

This directory contains reference code for integrating Daily.co as an alternative/hybrid video calling provider in the future.

## Prerequisites to Enable Daily.co

1. **Install Dependencies:**
   ```bash
   npm install @daily-co/daily-js @daily-co/daily-react
   ```

2. **Add Environment Variables to `.env`:**
   ```bash
   DAILY_API_KEY="your_api_key_here"
   DAILY_DOMAIN="your_daily_subdomain"
   ```

3. **Wire into `video-service.ts`:**
   Import `DailyVideoProvider` from `./daily-provider` and instantiate it under the `getVideoProvider` logic.
