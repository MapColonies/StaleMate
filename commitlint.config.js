const {
  utils: { getProjects },
} = require('@commitlint/config-pnpm-scopes').default;

module.exports = {
  extends: ['@map-colonies/commitlint-config', '@commitlint/config-pnpm-scopes'],
  rules: {
    'scope-empty': [2, 'never'],
    // The pnpm packages and `global`, plus `helm` for the umbrella chart, which isn't a package.
    'scope-enum': (ctx) => getProjects(ctx).then((scopes) => [2, 'always', [...scopes, 'helm']]),
  },
};
