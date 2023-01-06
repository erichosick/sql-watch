module.exports = {
  env: {
    es2021: true,
    node: true,
    'jest/globals': true, // - fix expect undefined no-undef
  },
  extends: [
    'airbnb-base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
    'jest', // fix - expect undefined no-undef
  ],
  rules: {
    // For typescript, eslint errors when defining a function type. We need to
    // disable no-unused-vars and then enable typescripts no-unused-vars.
    // We can now define function types but also get warnings/errors on actual
    // unused vars.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'import/extensions': [
      'error',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never', // fix - Missing file extension "ts" for "../src"
        tsx: 'never',
      },
    ],

    // https://stackoverflow.com/questions/69905008/stuck-with-eslint-error-separately-loops-should-be-avoided-in-favor-of-array-it
    // https://medium.com/@paul.beynon/thanks-for-taking-the-time-to-write-the-article-i-enjoyed-it-db916026647
    'no-restricted-syntax': 'off',

    // Enable files that have no default export.
    'import/prefer-default-export': 'off',

    // Cause I like private class variables to start with _.
    'no-underscore-dangle': 'off',

    'max-classes-per-file': 'off',

    // see https://stackoverflow.com/questions/63961803/eslint-says-all-enums-in-typescript-app-are-already-declared-in-the-upper-scope
    // note you must disable the base rule as it can report incorrect errors
    // When trying to declare an enum like export enum Environment { ... }
    // we get the error. 'Environment' is already declared in the upper scope
    // on line ...
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],
  },
  settings: {
    // fix -  Unable to resolve path to module '../src'
    'import/resolver': {
      node: {
        extensions: ['.ts'],
      },
    },
  },
};

// module.exports = {
//   env: {
//     browser: true,
//     es2021: true,
//     'jest/globals': true,
//   },
//   extends: [
//     'airbnb-base',
//   ],
//   parser: '@typescript-eslint/parser',
//   parserOptions: {
//     ecmaVersion: 'latest',
//     sourceType: 'module',
//   },
//   plugins: [
//     '@typescript-eslint',
//     'jest',
//   ],
//   rules: {
//     // see https://stackoverflow.com/questions/55807329/why-eslint-throws-no-unused-vars-for-typescript-interface
//     'no-unused-vars': 'off',
//     '@typescript-eslint/no-unused-vars': ['error'],
//     // see end
//     'import/extensions': [
//       'error',
//       'ignorePackages',
//       {
//         js: 'never',
//         jsx: 'never',
//         ts: 'never',
//         tsx: 'never',
//       },
//     ],
//     // airbnb
//     // https://stackoverflow.com/questions/69905008/stuck-with-eslint-error-separately-loops-should-be-avoided-in-favor-of-array-it
//     // https://medium.com/@paul.beynon/thanks-for-taking-the-time-to-write-the-article-i-enjoyed-it-db916026647
//     'no-restricted-syntax': 'off',

//     // https://basarat.gitbook.io/typescript/main-1/defaultisbad
//     'import/prefer-default-export': 'off',

//     // In my opinion, code is more readable if we explicitly write
//     // return await ...
//     'no-return-await': 'off',

//     // Cause I like private class variables to start with _.
//     'no-underscore-dangle': 'off',

//   },
//   ignorePatterns: ['**/lib/*'],
//   settings: {
//     'import/resolver': {
//       node: {
//         extensions: ['.ts'],
//       },
//     },
//   },
// };
