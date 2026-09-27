import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Argon2 hashing is deliberately slow; give integration tests some headroom.
    testTimeout: 20_000,
  },
})
