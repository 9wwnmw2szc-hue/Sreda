export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { preferIpv4Dns } = await import("./server/net/ipv4-first");
    preferIpv4Dns();
  }
}
