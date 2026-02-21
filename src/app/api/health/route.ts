/**
 * @fileoverview Health Check Endpoint
 * Used by Docker, Dockploy, and monitoring tools to verify the app is running.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
