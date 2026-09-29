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
  const hsts = 'max-age=31536000; includeSubDomains'
  const page = {
    withHsts: secureHeaders({ ...BASE_OPTIONS, strictTransportSecurity: hsts }),
    withoutHsts: secureHeaders({ ...BASE_OPTIONS, strictTransportSecurity: false }),
  }
  const upload = {
    withHsts: secureHeaders({ ...UPLOAD_OPTIONS, strictTransportSecurity: hsts }),
    withoutHsts: secureHeaders({ ...UPLOAD_OPTIONS, strictTransportSecurity: false }),
  }

  return async (c, next) => {
    const set = UPLOADED_CONTENT.test(c.req.path) ? upload : page
    // HSTS is only meaningful (and only honoured by browsers) over HTTPS.
    const handler = config.hsts && isSecureRequest(c, config) ? set.withHsts : set.withoutHsts
    return handler(c, next)
  }
}

/** Files people uploaded: they must never run anything, even when opened directly. */
const UPLOADED_CONTENT = /^\/api\/v1\/attachments\/[^/]+$/
const UPLOAD_OPTIONS: SecureHeadersOptions = {
  ...BASE_OPTIONS,
  contentSecurityPolicy: {
    defaultSrc: [NONE],
    imgSrc: [SELF],
    styleSrc: ["'unsafe-inline'"],
    frameAncestors: [NONE],
    sandbox: [],
  },
}
