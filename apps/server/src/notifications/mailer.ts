import nodemailer from 'nodemailer'

import type { SmtpConfig } from '../config.js'
import { DeliveryError } from './network.js'

export interface Mail {
  to: string
  subject: string
  text: string
}

/** Sends plain-text email; throws a `DeliveryError` when the server does not accept it. */
export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function createMailer(smtp: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from: smtp.from, ...mail })
      } catch {
        throw new DeliveryError('smtp')
      }
    },
  }
}
