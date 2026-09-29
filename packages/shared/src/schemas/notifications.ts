import { z } from 'zod'

import { idSchema, timestampSchema } from './common.js'

/** Where notifications can go besides the browser (Web Push). */
export const NOTIFICATION_CHANNEL_TYPES = ['ntfy', 'gotify', 'apprise', 'email'] as const
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number]

const channelNameSchema = z.string().trim().min(1).max(60)
/** A notification service reachable over HTTP(S), often in the same network. */
const serviceUrlSchema = z
  .string()
  .trim()
  .max(500)
  .check(z.url({ protocol: /^https?$/, error: 'validation.url_invalid' }))

export const createChannelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ntfy'),
    name: channelNameSchema,
    server: serviceUrlSchema.default('https://ntfy.sh'),
    /** Anyone who knows a topic on a public server can read it – pick a hard-to-guess one. */
    topic: z
      .string()
      .trim()
      .regex(/^[\w-]{1,64}$/, { error: 'validation.topic_format' }),
    /** Access token for protected topics. */
    token: z.string().trim().max(256).optional(),
  }),
  z.object({
    type: z.literal('gotify'),
    name: channelNameSchema,
    server: serviceUrlSchema,
    /** An application token. */
    token: z.string().trim().min(1).max(256),
  }),
  z.object({
    type: z.literal('apprise'),
    name: channelNameSchema,
    /** The notify URL of an Apprise API server, e.g. `http://apprise:8000/notify/crystal`. */
    url: serviceUrlSchema,
  }),
  z.object({
    type: z.literal('email'),
    name: channelNameSchema,
  }),
])
export type CreateChannelInput = z.input<typeof createChannelSchema>
export type CreateChannelData = z.output<typeof createChannelSchema>

export const updateChannelSchema = z
  .object({
    name: channelNameSchema,
    enabled: z.boolean(),
  })
  .partial()
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>

/** A channel as the API returns it: secrets such as tokens are never sent back. */
export const channelSchema = z.object({
  id: idSchema,
  type: z.enum(NOTIFICATION_CHANNEL_TYPES),
  name: z.string(),
  /** Where messages go, for display (e.g. `ntfy.sh/crystal-anna`). */
  target: z.string(),
  enabled: z.boolean(),
  lastSentAt: timestampSchema.nullable(),
  /**
   * Why the last delivery failed, cleared by the next successful one:
   * `timeout`, `dns`, `unreachable`, `blocked`, `smtp`, `config` or `http:<status>`.
   */
  lastError: z.string().nullable(),
  createdAt: timestampSchema,
})
export type NotificationChannel = z.infer<typeof channelSchema>

/** `PushSubscription.toJSON()` from the browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .check(z.url({ protocol: /^https$/ })),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>

export const pushDeviceSchema = z.object({
  id: idSchema,
  endpoint: z.string(),
  userAgent: z.string().nullable(),
  createdAt: timestampSchema,
})
export type PushDevice = z.infer<typeof pushDeviceSchema>

export const pushStatusSchema = z.object({
  /** The VAPID key browsers need to subscribe. */
  publicKey: z.string(),
  devices: z.array(pushDeviceSchema),
})
export type PushStatus = z.infer<typeof pushStatusSchema>
