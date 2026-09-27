/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow long URLs and co-author trailers in commit bodies.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
}
