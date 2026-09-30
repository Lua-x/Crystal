import type { ErrorCode } from '@crystal/shared'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  validation_failed: 'The request is invalid.',
  unauthorized: 'You need to sign in first.',
  forbidden: 'You are not allowed to do this.',
  not_found: 'Not found.',
  rate_limited: 'Too many requests. Please try again later.',
  csrf_failed: 'The request origin could not be verified.',
  internal_error: 'Something went wrong on the server.',
  invalid_credentials: 'Username or password is incorrect.',
  account_disabled: 'This account has been disabled.',
  password_login_disabled: 'Signing in with a password is disabled on this instance.',
  registration_closed: 'Registration is closed.',
  invite_invalid: 'This invite link is invalid or has expired.',
  username_taken: 'This username is already taken.',
  email_taken: 'This email address is already in use.',
  wrong_password: 'The current password is incorrect.',
  last_admin: 'At least one active administrator must remain.',
  cannot_modify_self: 'You cannot change this for your own account.',
  oidc_not_configured: 'Single sign-on is not configured.',
  oidc_failed: 'Single sign-on failed.',
  oidc_already_linked: 'This single sign-on account is linked to another user.',
  oidc_account_not_found: 'No account is linked to this single sign-on identity.',
  identity_required: 'Set a password before removing your only sign-in method.',
  list_is_default: 'The default list cannot be deleted or shared.',
  already_member: 'This person already has access to the list.',
  owner_cannot_leave: 'The owner cannot leave the list; delete it instead.',
  not_a_member: 'Only people who can edit the list can be assigned.',
  reset_invalid: 'This reset link is invalid or has expired.',
  email_required: 'Add an email address to your account first.',
  email_not_configured: 'Sending email is not configured on this instance.',
  delivery_failed: 'The notification could not be delivered.',
  token_not_allowed: 'API tokens cannot be used for this; sign in instead.',
  import_invalid: 'The file cannot be imported.',
  payload_too_large: 'The request is too large.',
  unsupported_file: 'Only images and PDF files can be attached.',
  too_many_attachments: 'This task already has as many attachments as it can have.',
  steam_not_configured: 'Steam is not set up on this instance (STEAM_API_KEY).',
  steam_not_linked: 'Link a Steam account first.',
  steam_profile_not_found: 'There is no Steam profile with this name or link.',
  steam_profile_private: 'The game details of this Steam profile are private.',
  steam_game_not_found: 'This game is not linked to Steam.',
  steam_already_imported: 'This Steam game has already been imported.',
  steam_no_achievements: 'This game has no achievements on Steam.',
  steam_unavailable: 'Steam could not be reached. Please try again later.',
}

/** An expected failure that is reported to the client as `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'AppError'
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    }
  }
}

export const unauthorized = () => new AppError(401, 'unauthorized')
export const forbidden = () => new AppError(403, 'forbidden')
export const notFound = () => new AppError(404, 'not_found')
