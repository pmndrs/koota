// eslint.config.js - ESLint 9+ Flat Config for TypeScript
// Copy this file to your project root as eslint.config.js

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base ESLint recommendations
  eslint.configs.recommended,

  // TypeScript strict type-checking
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript parser configuration
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  // Custom TypeScript rules
  {
    rules: {
      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],

      // Enforce type imports for better tree-shaking
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports'
      }],

      // Prevent unhandled promises
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Prevent awaiting non-promises
      '@typescript-eslint/await-thenable': 'error',

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'error',

      // Consistent type assertions
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'never'
      }],

      // Naming conventions
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase']
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase']
        },
        {
          selector: 'enum',
          format: ['PascalCase']
        }
      ]
    }
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts'
    ]
  }
);
