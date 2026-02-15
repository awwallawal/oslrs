import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name=/^(querySelector|querySelectorAll|closest|matches)$/][arguments.0.type='Literal'][arguments.0.value=/[.#]/]",
          message:
            'Team Agreement A3: avoid CSS class/id selectors in tests. Use getByRole/getByLabelText/getByText/getByTestId instead.',
        },
        {
          selector:
            "CallExpression[callee.property.name='toHaveClass'] > MemberExpression.object > CallExpression[callee.name='expect'] > :matches(CallExpression[callee.property.name=/^(querySelector|querySelectorAll|closest|matches)$/][arguments.0.type='Literal'][arguments.0.value=/[.#]/], MemberExpression[property.name=/^(querySelector|querySelectorAll|closest|matches)$/])",
          message:
            'Team Agreement A3: do not use toHaveClass() on nodes discovered via CSS/DOM selector chains. Use accessible queries (role/label/text/testid) instead.',
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='locator'][arguments.0.type='Literal']",
          message:
            'Team Agreement A3: avoid locator("...") CSS/string selectors in Playwright tests. Use getByRole/getByLabel/getByText/getByTestId. For hCaptcha iframe checkbox only, use a narrow eslint-disable with rationale.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // General rules
      'no-console': 'warn',
    },
  },
  // Test files - with Vitest globals
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused in tests
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // Relax in tests
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  }
);
