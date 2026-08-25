import "dotenv/config";

async function run() {
  console.log("=== 1. Testing Guest Join API Endpoint directly ===");
  const postRes = await fetch("http://localhost:3000/api/guest/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "frns-avkb-gneo",
      name: "E2E Automated Guest",
    }),
  });

  const postData = await postRes.json();
  console.log("POST /api/guest/join result:", postData);
  if (!postData.requestId) {
    console.error("Failed to get requestId from POST /api/guest/join");
    process.exit(1);
  }

  console.log("=== 2. Polling Guest Join Status (Pending) ===");
  const getPendingRes = await fetch(`http://localhost:3000/api/guest/join?requestId=${postData.requestId}`);
  const getPendingData = await getPendingRes.json();
  console.log("GET /api/guest/join pending result:", getPendingData);

  console.log("=== 3. Simulating Host Admission in DB ===");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE guest_join_requests SET status = 'ADMITTED', responded_at = NOW() WHERE id = ${postData.requestId}`;

  console.log("=== 4. Polling Guest Join Status (Admitted) ===");
  const getAdmittedRes = await fetch(`http://localhost:3000/api/guest/join?requestId=${postData.requestId}`);
  const getAdmittedData = await getAdmittedRes.json();
  console.log("GET /api/guest/join admitted result:", {
    status: getAdmittedData.status,
    sessionId: getAdmittedData.sessionId,
    userName: getAdmittedData.userName,
    teacherIdentity: getAdmittedData.teacherIdentity,
    hasToken: Boolean(getAdmittedData.token),
    serverUrl: getAdmittedData.serverUrl,
  });

  if (getAdmittedData.status === "ADMITTED" && getAdmittedData.token) {
    console.log("\n✅ E2E GUEST JOIN TEST COMPLETED SUCCESSFULLY!");
  } else {
    console.error("❌ E2E GUEST JOIN TEST FAILED");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
