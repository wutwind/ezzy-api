import { defineConfig } from 'oxlint';

export default defineConfig({
    ignorePatterns: ['*.spec.ts', 'examples/**'],
    categories: {
        perf: 'error',
        style: 'error',
        nursery: 'error',
        pedantic: 'error',
        suspicious: 'error',
        correctness: 'error',
        restriction: 'error',
    },
    options: {
        typeAware: true,
    },
    plugins: ['promise'],
    rules: {
        'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
        'id-length': [
            'error',
            {
                exceptions: ['T', 'K', 'V'],
                properties: 'never',
            },
        ],
        'no-ternary': 'off',
        'no-undefined': 'off',
        'init-declarations': 'off',
        'no-magic-numbers': 'off',
        'one-var': 'off',
        'prefer-arrow-callback': 'error',
        'prefer-named-capture-group': 'off',
        'sort-imports': 'off',
        'sort-keys': 'off',
        'typescript/consistent-type-definitions': ['error', 'interface'],
        'typescript/ban-types': 'off',
        'typescript/consistent-indexed-object-style': 'off',
        'typescript/no-empty-object-type': 'off',
        'typescript/prefer-readonly-parameter-types': 'off',
        'unicorn/filename-case': [
            'error',
            {
                cases: {
                    camelCase: true,
                    pascalCase: true,
                },
            },
        ],
        'no-shadow': 'error',
        'no-shadow-restricted-names': 'error',
        'no-async-await': 'off',
        'promise/prefer-await-to-then': 'error',
        'typescript/promise-function-async': 'error',
    },
});
