export {}

/**
 * Used by the Docker HEALTHCHECK. The distroless image has no shell or curl,
 * so the check is a tiny Node script.
 */
const port = process.env.PORT ?? '3000'

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(4000),
  })
  process.exit(response.ok ? 0 : 1)
} catch {
  process.exit(1)
}
