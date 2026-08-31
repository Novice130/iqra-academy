export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    if (dns.setDefaultResultOrder) {
      dns.setDefaultResultOrder("ipv4first");
    }
  }
}
