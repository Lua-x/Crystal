import { describe, expect, it } from 'vitest'

import { ConfigError, loadConfig } from './config.js'

describe('loadConfig', () => {
  it('uses secure defaults', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      env: 'development',
      host: '0.0.0.0',
      port: 3000,
      baseUrl: undefined,
      dataDir: './data',
      registration: 'invite',
      passwordLogin: true,
      trustProxyHops: 0,
      hsts: false,
      sessionTtlDays: 30,
      oidc: undefined,
    })
  })

  it('treats empty values like unset ones', () => {
    expect(loadConfig({ PORT: '', BASE_URL: '  ' }).port).toBe(3000)
  })

  it('parses booleans, numbers and URLs', () => {
    const config = loadConfig({
      PORT: '8080',
      BASE_URL: 'https://todo.example.org',
      HSTS: 'yes',
      PASSWORD_LOGIN: 'true',
      TRUST_PROXY: 'true',
      REGISTRATION: 'open',
    })
    expect(config.port).toBe(8080)
    expect(config.baseUrl?.origin).toBe('https://todo.example.org')
    expect(config.hsts).toBe(true)
    expect(config.trustProxyHops).toBe(1)
    expect(config.registration).toBe('open')
  })

  it.each([
    ['false', 0],
    ['2', 2],
  ])('parses TRUST_PROXY=%s', (value, hops) => {
    expect(loadConfig({ TRUST_PROXY: value }).trustProxyHops).toBe(hops)
  })

  it('reports every problem at once', () => {
    let error: unknown
    try {
      loadConfig({ PORT: 'eighty', REGISTRATION: 'sometimes', TRUST_PROXY: 'maybe' })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ConfigError)
    const problems = (error as ConfigError).problems.join('\n')
    expect(problems).toContain('PORT')
    expect(problems).toContain('REGISTRATION')
    expect(problems).toContain('TRUST_PROXY')
  })

  it('requires BASE_URL and a client ID for OIDC', () => {
    expect(() => loadConfig({ OIDC_ISSUER: 'https://id.example.org' })).toThrow(/OIDC_CLIENT_ID/)
    expect(() =>
      loadConfig({ OIDC_ISSUER: 'https://id.example.org', OIDC_CLIENT_ID: 'crystal' }),
    ).toThrow(/BASE_URL/)
  })

  it('builds the OIDC configuration', () => {
    const config = loadConfig({
      BASE_URL: 'https://todo.example.org',
      OIDC_ISSUER: 'https://id.example.org/application/o/crystal/',
      OIDC_CLIENT_ID: 'crystal',
      OIDC_CLIENT_SECRET: 's3cret',
      OIDC_BUTTON_LABEL: 'Authentik',
      OIDC_ADMIN_GROUP: 'crystal-admins',
    })
    expect(config.oidc).toMatchObject({
      clientId: 'crystal',
      clientSecret: 's3cret',
      buttonLabel: 'Authentik',
      autoRegister: true,
      adminGroup: 'crystal-admins',
      groupsClaim: 'groups',
    })
  })

  it('refuses to disable password login without another way to sign in', () => {
    expect(() => loadConfig({ PASSWORD_LOGIN: 'false' })).toThrow(/PASSWORD_LOGIN/)
  })

  it('refuses a BASE_URL with a path', () => {
    expect(() => loadConfig({ BASE_URL: 'https://example.org/todo' })).toThrow(/BASE_URL/)
  })

  it('requires a long SECRET_KEY', () => {
    expect(() => loadConfig({ SECRET_KEY: 'short' })).toThrow(/SECRET_KEY/)
  })
})
