import { setDefaultResultOrder } from "node:dns";

/**
 * Selective WireGuard routing on RU pins IPv4 /32 destinations.
 * Prefer A over AAAA so Node fetch does not bypass wg0 via IPv6.
 * Safe no-op if the runtime does not support the API.
 */
export function preferIpv4Dns(): void {
  try {
    setDefaultResultOrder("ipv4first");
  } catch {
    /* older Node — ignore */
  }
}
