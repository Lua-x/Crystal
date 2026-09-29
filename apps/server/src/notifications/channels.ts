import type { CreateChannelData, Locale } from '@crystal/shared'

import type { Mailer } from './mailer.js'
import { emailFooter, type Notification } from './messages.js'
import { DeliveryError, postJson, type NetworkPolicy } from './network.js'

/** A channel's settings as stored (sealed) in the database. */
export type ChannelConfig =
  | { type: 'ntfy'; server: string; topic: string; token?: string | undefined }
  | { type: 'gotify'; server: string; token: string }
  | { type: 'apprise'; url: string }
  | { type: 'email' }

export function configFromInput(input: CreateChannelData): ChannelConfig {
  switch (input.type) {
    case 'ntfy':
      return {
        type: 'ntfy',
        server: input.server,
        topic: input.topic,
        token: input.token || undefined,
      }
    case 'gotify':
      return { type: 'gotify', server: input.server, token: input.token }
    case 'apprise':
      return { type: 'apprise', url: input.url }
    case 'email':
      return { type: 'email' }
  }
}

/** Where messages go, without secrets – e.g. `ntfy.sh/crystal-anna`. */
export function describeTarget(config: ChannelConfig): string {
  const shorten = (url: string) => {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '')
  }
  switch (config.type) {
    case 'ntfy':
      return `${shorten(config.server)}/${config.topic}`
    case 'gotify':
      return shorten(config.server)
    case 'apprise':
      return shorten(config.url)
    case 'email':
      return ''
  }
}

export interface DeliveryContext {
  policy: NetworkPolicy
  /** Makes links absolute; without it, messages go out without a link. */
  baseUrl: URL | undefined
  mailer: Mailer | undefined
  recipient: { email: string | null; locale: Locale }
}

const withSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`)

export async function sendToChannel(
  config: ChannelConfig,
  notification: Notification,
  context: DeliveryContext,
): Promise<void> {
  const link = context.baseUrl ? new URL(notification.path, context.baseUrl).href : undefined
  switch (config.type) {
    case 'ntfy':
      // JSON publishing avoids encoding non-ASCII titles into headers.
      await postJson(
        withSlash(config.server),
        {
          topic: config.topic,
          title: notification.title,
          message: notification.body,
          ...(link ? { click: link } : {}),
        },
        config.token ? { authorization: `Bearer ${config.token}` } : {},
        context.policy,
      )
      return
    case 'gotify':
      await postJson(
        new URL('message', withSlash(config.server)).href,
        {
          title: notification.title,
          message: notification.body,
          priority: 5,
          ...(link ? { extras: { 'client::notification': { click: { url: link } } } } : {}),
        },
        { 'x-gotify-key': config.token },
        context.policy,
      )
      return
    case 'apprise':
      await postJson(
        config.url,
        {
          title: notification.title,
          body: link ? `${notification.body}\n\n${link}` : notification.body,
          type: 'info',
        },
        {},
        context.policy,
      )
      return
    case 'email': {
      const { mailer, recipient } = context
      if (!mailer || !recipient.email) throw new DeliveryError('smtp')
      await mailer.send({
        to: recipient.email,
        subject: notification.title,
        text: [notification.body, link, `-- \n${emailFooter(recipient.locale)}`]
          .filter(Boolean)
          .join('\n\n'),
      })
      return
    }
  }
}
