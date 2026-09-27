import type { MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { isSecureRequest } from '../auth/cookies.js'
import type { Config } from '../config.js'
import type { AppEnv } from '../context.js'

type SecureHeadersOptions = NonNullable<Parameters<typeof secureHeaders>[0]>

const SELF = "'self'"
const NONE = "'none'"

/**
 * Strict defaults: scripts only from our own origin, no framing, no third-party
 * connections. Inline styles are allowed because Radix positions popovers with
 * style attributes; inline scripts are not.
 */
const BASE_OPTIONS: SecureHeadersOptions = {
  contentSecurityPolicy: {
    defaultSrc: [SELF],
    scriptSrc: [SELF],
    styleSrc: [SELF, "'unsafe-inline'"],
    imgSrc: [SELF, 'data:', 'blob:'],
    fontSrc: [SELF],
    connectSrc: [SELF],
    manifestSrc: [SELF],
    workerSrc: [SELF],
    objectSrc: [NONE],
    baseUri: [SELF],
    formAction: [SELF],
    frameAncestors: [NONE],
  },
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  referrerPolicy: 'strict-origin-when-cross-origin',
  xFrameOptions: 'DENY',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
  },
}

export function securityHeaders(config: Config): MiddlewareHandler<AppEnv> {
  const withHsts = secureHeaders({
    ...BASE_OPTIONS,
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  })
  const withoutHsts = secureHeaders({ ...BASE_OPTIONS, strictTransportSecurity: false })

  return async (c, next) => {
    // HSTS is only meaningful (and only honoured by browsers) over HTTPS.
    const handler = config.hsts && isSecureRequest(c, config) ? withHsts : withoutHsts
    return handler(c, next)
  }
}
