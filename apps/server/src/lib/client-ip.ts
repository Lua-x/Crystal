/**
 * Determines the client address when `trustedHops` reverse proxies sit in front
 * of the server. Each trusted proxy appends the address it received the request
 * from to X-Forwarded-For, so the client is found by walking back from the right
 * past the trusted hops; anything further left may be forged by the client.
 */
export function resolveClientIp(
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedHops: number,
): string | undefined {
  if (trustedHops === 0 || !forwardedFor) return normalize(socketAddress)

  const chain = [
    ...forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
    socketAddress,
  ].filter((address): address is string => Boolean(address))

  const index = Math.max(0, chain.length - 1 - trustedHops)
  return normalize(chain[index])
}

function normalize(address: string | undefined): string | undefined {
  // IPv4 clients of a dual-stack socket show up as `::ffff:1.2.3.4`.
  return address?.startsWith('::ffff:') ? address.slice(7) : address
}
