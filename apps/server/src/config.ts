import { join } from 'node:path'

import { REGISTRATION_MODES } from '@crystal/shared'
import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'], {
    error: 'expected true or false',
  })
  .transform((value) => ['true', '1', 'yes', 'on'].includes(value))

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional()

const urlFromEnv = z
  .url({ protocol: /^https?$/, error: 'expected an http(s) URL' })
  .transform((value) => new URL(value))

/**
 * `false` trusts no proxy, `true` trusts one, a number trusts that many hops.
 * Only trusted hops may set X-Forwarded-For / X-Forwarded-Proto / X-Forwarded-Host.
 */
const trustProxyFromEnv = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    if (['false', '0', 'no', 'off', ''].includes(value)) return 0
    if (['true', 'yes', 'on'].includes(value)) return 1
    const hops = Number(value)
    if (Number.isInteger(hops) && hops > 0 && hops < 10) return hops
    ctx.addIssue({ code: 'custom', message: 'expected true, false or a number of proxy hops' })
    return z.NEVER
  })

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BASE_URL: urlFromEnv.optional(),
    DATA_DIR: z.string().trim().min(1).default('./data'),
    STATIC_DIR: optionalString,
    SECRET_KEY: z
      .string()
      .trim()
      .min(32, { error: 'must be at least 32 characters long' })
      .optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    TRUST_PROXY: trustProxyFromEnv.default(0),
    HSTS: booleanFromEnv.default(false),
    REGISTRATION: z.enum(REGISTRATION_MODES).default('invite'),
    PASSWORD_LOGIN: booleanFromEnv.default(true),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    OIDC_ISSUER: urlFromEnv.optional(),
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_BUTTON_LABEL: z.string().trim().min(1).max(40).default('SSO'),
    OIDC_SCOPES: z.string().trim().min(1).default('openid profile email'),
    OIDC_AUTO_REGISTER: booleanFromEnv.default(true),
    OIDC_ADMIN_GROUP: optionalString,
    OIDC_GROUPS_CLAIM: z.string().trim().min(1).default('groups'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** Implicit TLS; defaults to true on port 465 (STARTTLS is used otherwise when offered). */
    SMTP_SECURE: booleanFromEnv.optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM: optionalString,
    REMINDER_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    NOTIFY_PRIVATE_NETWORKS: booleanFromEnv.default(true),
    /** 0 turns automatic backups off. */
    BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(0).max(720).default(24),
    BACKUP_RETENTION: z.coerce.number().int().min(1).max(365).default(7),
    BACKUP_DIR: optionalString,
    ATTACHMENT_MAX_MB: z.coerce.number().int().min(1).max(100).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.BASE_URL && (env.BASE_URL.pathname !== '/' || env.BASE_URL.search)) {
      ctx.addIssue({
        code: 'custom',
        path: ['BASE_URL'],
        message: 'must not contain a path; serve Crystal from the root of a domain or subdomain',
      })
    }
    const oidcValues = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID]
    if (oidcValues.some(Boolean) && !oidcValues.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'OIDC_ISSUER and OIDC_CLIENT_ID must be set together',
      })
    }
    if (env.OIDC_ISSUER && !env.BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['BASE_URL'],
        message: 'is required when OIDC is enabled (it is used to build the redirect URL)',
      })
    }
    if (env.SMTP_HOST && !env.SMTP_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_FROM'],
        message: 'is required when SMTP_HOST is set, e.g. "Crystal <crystal@example.com>"',
      })
    }
    if (!env.PASSWORD_LOGIN && !env.OIDC_ISSUER) {
      ctx.addIssue({
        code: 'custom',
        path: ['PASSWORD_LOGIN'],
        message: 'can only be disabled when OIDC is configured, otherwise nobody could sign in',
      })
    }
  })

export interface OidcConfig {
  issuer: URL
  clientId: string
  clientSecret: string | undefined
  buttonLabel: string
  scopes: string
  autoRegister: boolean
  adminGroup: string | undefined
  groupsClaim: string
}

export interface Config {
  env: 'development' | 'production' | 'test'
  host: string
  port: number
  /** Public URL of the instance, e.g. `https://todo.example.com`. */
  baseUrl: URL | undefined
  dataDir: string
  staticDir: string | undefined
  /** Explicit secret from the environment; otherwise one is generated in the data directory. */
  secretKey: string | undefined
  logLevel: (typeof LOG_LEVELS)[number]
  trustProxyHops: number
  hsts: boolean
  registration: (typeof REGISTRATION_MODES)[number]
  passwordLogin: boolean
  sessionTtlDays: number
  oidc: OidcConfig | undefined
  /** Outgoing email for notifications and password resets. */
  smtp: SmtpConfig | undefined
  /** How often due reminders and daily summaries are checked. */
  reminderIntervalMs: number
  /** Whether notification channels may point to loopback and private network addresses. */
  notifyPrivateNetworks: boolean
  attachments: {
    directory: string
    maxBytes: number
  }
  backups: {
    /** 0 when automatic backups are off. */
    intervalHours: number
    /** How many backups are kept; older ones are deleted. */
    retention: number
    directory: string
  }
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string | undefined
  password: string | undefined
  from: string
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

/** Parses and validates the environment. Throws a `ConfigError` listing every problem. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty strings like unset variables so `.env` templates can list every key.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  )
  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      ),
    )
  }
  const parsed = result.data

  return {
    env: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    baseUrl: parsed.BASE_URL,
    dataDir: parsed.DATA_DIR,
    staticDir: parsed.STATIC_DIR,
    secretKey: parsed.SECRET_KEY,
    logLevel: parsed.LOG_LEVEL,
    trustProxyHops: parsed.TRUST_PROXY,
    hsts: parsed.HSTS,
    registration: parsed.REGISTRATION,
    passwordLogin: parsed.PASSWORD_LOGIN,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    oidc:
      parsed.OIDC_ISSUER && parsed.OIDC_CLIENT_ID
        ? {
            issuer: parsed.OIDC_ISSUER,
            clientId: parsed.OIDC_CLIENT_ID,
            clientSecret: parsed.OIDC_CLIENT_SECRET,
            buttonLabel: parsed.OIDC_BUTTON_LABEL,
            scopes: parsed.OIDC_SCOPES,
            autoRegister: parsed.OIDC_AUTO_REGISTER,
            adminGroup: parsed.OIDC_ADMIN_GROUP,
            groupsClaim: parsed.OIDC_GROUPS_CLAIM,
          }
        : undefined,
    smtp:
      parsed.SMTP_HOST && parsed.SMTP_FROM
        ? {
            host: parsed.SMTP_HOST,
            port: parsed.SMTP_PORT,
            secure: parsed.SMTP_SECURE ?? parsed.SMTP_PORT === 465,
            user: parsed.SMTP_USER,
            password: parsed.SMTP_PASSWORD,
            from: parsed.SMTP_FROM,
          }
        : undefined,
    reminderIntervalMs: parsed.REMINDER_INTERVAL_SECONDS * 1000,
    notifyPrivateNetworks: parsed.NOTIFY_PRIVATE_NETWORKS,
    attachments: {
      directory: join(parsed.DATA_DIR, 'attachments'),
      maxBytes: parsed.ATTACHMENT_MAX_MB * 1024 * 1024,
    },
    backups: {
      intervalHours: parsed.BACKUP_INTERVAL_HOURS,
      retention: parsed.BACKUP_RETENTION,
      directory: parsed.BACKUP_DIR ?? join(parsed.DATA_DIR, 'backups'),
    },
  }
}
