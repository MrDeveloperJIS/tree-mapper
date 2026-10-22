'use strict';

module.exports = [
    {
        files: ['src/**/*.js', 'test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'writable',
                process: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
                __dirname: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { caughtErrors: 'none' }],
            'prefer-const': 'warn',
            eqeqeq: 'warn',
        },
    },
];