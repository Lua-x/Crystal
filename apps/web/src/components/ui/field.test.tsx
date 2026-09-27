import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { initI18n } from '../../lib/i18n'
import { Field } from './field'
import { Input, PasswordInput } from './input'

beforeAll(() => initI18n('en'))
afterEach(cleanup)

describe('Field', () => {
  it('connects label, hint and control', () => {
    render(
      <Field label="Username" description="Used to sign in">
        {(props) => <Input {...props} />}
      </Field>,
    )
    const input = screen.getByLabelText('Username')
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Used to sign in',
    )
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('announces errors and translates message keys', () => {
    render(
      <Field label="Username" error="validation.username_format">
        {(props) => <Input {...props} />}
      </Field>,
    )
    const input = screen.getByLabelText('Username')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe(
      'Lowercase letters, digits, dots, dashes and underscores only',
    )
  })
})

describe('PasswordInput', () => {
  it('toggles visibility with an accessible button', async () => {
    render(
      <Field label="Password">
        {(props) => <PasswordInput {...props} defaultValue="secret" />}
      </Field>,
    )
    const input = screen.getByLabelText('Password')
    expect(input.getAttribute('type')).toBe('password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})
