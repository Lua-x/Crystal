/**
 * Used by the Docker HEALTHCHECK. The distroless image has no shell or curl,
 * so the check is a tiny Node script. It uses a one-off connection (no
 * keep-alive) and lets the process end on its own instead of exiting while
 * sockets are still closing.
 */
import { get } from 'node:http'

const port = Number(process.env.PORT ?? 3000)

const request = get(
  { host: '127.0.0.1', port, path: '/api/health', agent: false, timeout: 4000 },
  (response) => {
    process.exitCode = response.statusCode === 200 ? 0 : 1
    response.resume()
  },
)
request.on('timeout', () => request.destroy(new Error('Health check timed out')))
request.on('error', () => {
  process.exitCode = 1
})
