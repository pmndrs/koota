# Modern Toolchain Reference

> **Load when:** User asks about Vite, pnpm, ESLint, Vitest, tsconfig, build tools, or project configuration.

Modern TypeScript toolchain configuration for 2025.

## Contents

- [TypeScript Configuration](#typescript-configuration)
- [Package Manager (pnpm)](#package-manager-pnpm)
- [Build Tool (Vite)](#build-tool-vite)
- [Linting (ESLint 9)](#linting-eslint-9)
- [Testing (Vitest)](#testing-vitest)
- [Formatting (Prettier)](#formatting-prettier)

---

## TypeScript Configuration

### Strict Enterprise Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    // Language and Environment
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "ESNext",
    "moduleResolution": "bundler",

    // Strict Type Checking
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    // Module Handling
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    // Output
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",

    // Path Aliases
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },

    // Performance
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": "./node_modules/.cache/tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### React Project Configuration

```json
// tsconfig.json for React
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Node.js Backend Configuration

```json
// tsconfig.json for Node.js/NestJS
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,

    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,

    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,

    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

---

## Package Manager (pnpm)

### Why pnpm

| Feature | npm | pnpm |
|---------|-----|------|
| Disk usage | Duplicates packages | Shared store, symlinks |
| Install speed | Slower | 2-3x faster |
| Strictness | Allows phantom deps | Strict by default |
| Monorepo support | Basic workspaces | First-class support |

### Basic Commands

```bash
# Install dependencies
pnpm install

# Add packages
pnpm add typescript
pnpm add -D vitest @types/node

# Run scripts
pnpm run build
pnpm test

# Update packages
pnpm update
pnpm update --interactive

# List packages
pnpm list
pnpm why lodash

# Clean install
pnpm install --frozen-lockfile
```

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```json
// package.json (root)
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint"
  }
}
```

---

## Build Tool (Vite)

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths()
  ],
  server: {
    port: 3000,
    host: true
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['lodash-es', 'date-fns']
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
});
```

### Library Mode

```typescript
// vite.config.ts for library
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'MyLibrary',
      fileName: 'my-library',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  },
  plugins: [
    dts({ insertTypesEntry: true })
  ]
});
```

---

## Linting (ESLint 9)

### Flat Config Format

```javascript
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Base ESLint recommendations
  eslint.configs.recommended,

  // TypeScript strict type-checking
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript parser options
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  // React configuration
  {
    files: ['**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off'
    },
    settings: {
      react: { version: 'detect' }
    }
  },

  // Custom rules
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports'
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error'
    }
  },

  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js']
  }
);
```

### Common Rules Explained

```javascript
// Important TypeScript ESLint rules
{
  rules: {
    // Enforce type imports for better tree-shaking
    '@typescript-eslint/consistent-type-imports': 'error',

    // Prevent unhandled promises
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // Prevent awaiting non-promises
    '@typescript-eslint/await-thenable': 'error',

    // Require return types on functions
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true
    }],

    // Prefer nullish coalescing
    '@typescript-eslint/prefer-nullish-coalescing': 'error',

    // Prefer optional chaining
    '@typescript-eslint/prefer-optional-chain': 'error',

    // No any type
    '@typescript-eslint/no-explicit-any': 'error',

    // Enforce strict boolean expressions
    '@typescript-eslint/strict-boolean-expressions': 'error'
  }
}
```

---

## Testing (Vitest)

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.d.ts', '**/*.config.*', '**/test/**']
    },
    typecheck: {
      enabled: true
    }
  }
});
```

### Test Setup

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
beforeAll(() => {
  vi.stubEnv('API_URL', 'http://localhost:3000');
});

afterAll(() => {
  vi.unstubAllEnvs();
});
```

### Example Tests

```typescript
// src/utils/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from './format';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});

// src/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders with label', () => {
    render(<Button label="Click me" onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button label="Click" onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

---

## Formatting (Prettier)

### Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### Integration with ESLint

```javascript
// eslint.config.js
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // ... other configs
  eslintConfigPrettier // Must be last to disable conflicting rules
);
```

### Package Scripts

```json
// package.json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Complete Project Setup

### Quick Start Script

```bash
#!/bin/bash
# setup-ts-project.sh

PROJECT_NAME=${1:-my-app}

# Create project with Vite
pnpm create vite@latest $PROJECT_NAME --template react-ts
cd $PROJECT_NAME

# Install dependencies
pnpm install

# Add development dependencies
pnpm add -D \
  typescript-eslint \
  @eslint/js \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-config-prettier \
  prettier \
  vitest \
  @vitest/coverage-v8 \
  @testing-library/react \
  @testing-library/jest-dom \
  vite-tsconfig-paths

echo "Project setup complete! Run: cd $PROJECT_NAME && pnpm dev"
```
