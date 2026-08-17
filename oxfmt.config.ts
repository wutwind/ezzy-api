import { defineConfig } from 'oxfmt';

export default defineConfig({
    printWidth: 110,
    tabWidth: 4,
    singleQuote: true,
    semi: true,
    insertFinalNewline: true,
    sortImports: true,
    overrides: [
        {
            files: ['*.{yml,yaml}'],
            options: {
                tabWidth: 2,
            },
        },
    ],
});
