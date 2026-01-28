---
name: mastering-typescript
description: |
  Master enterprise-grade TypeScript development with type-safe patterns, modern tooling, and framework integration. This skill provides comprehensive guidance for TypeScript 5.9+, covering type system fundamentals (generics, mapped types, conditional types, satisfies operator), enterprise patterns (error handling, validation with Zod), React integration for type-safe frontends, NestJS for scalable APIs, and LangChain.js for AI applications. Use when building type-safe applications, migrating JavaScript codebases, configuring modern toolchains (Vite 7, pnpm, ESLint, Vitest), implementing advanced type patterns, or comparing TypeScript with Java/Python approaches.
version: 1.0.0
category: programming-languages
triggers:
  - typescript
  - ts
  - type-safe
  - generics
  - nestjs typescript
  - react typescript
  - typescript migration
  - tsconfig
  - type guards
  - mapped types
  - conditional types
  - satisfies operator
  - zod validation
author: Richard Hightower
license: MIT
tags:
  - typescript
  - type-safety
  - enterprise
  - react
  - nestjs
  - langchain
  - vite
---

# Mastering Modern TypeScript

Build enterprise-grade, type-safe applications with TypeScript 5.9+.

> **Compatibility:** TypeScript 5.9+, Node.js 22 LTS, Vite 7, NestJS 11, React 19

## Quick Start

```bash
# Initialize TypeScript project with ESM
pnpm create vite@latest my-app --template vanilla-ts
cd my-app && pnpm install

# Configure strict TypeScript
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
EOF
```

## When to Use This Skill

Use when:
- Building type-safe React, NestJS, or Node.js applications
- Migrating JavaScript codebases to TypeScript
- Implementing advanced type patterns (generics, mapped types, conditional types)
- Configuring modern TypeScript toolchains (Vite, pnpm, ESLint)
- Designing type-safe API contracts with Zod validation
- Comparing TypeScript approaches with Java or Python

## Project Setup Checklist

Before starting any TypeScript project:

```
- [ ] Use pnpm for package management (faster, disk-efficient)
- [ ] Configure ESM-first (type: "module" in package.json)
- [ ] Enable strict mode in tsconfig.json
- [ ] Set up ESLint with @typescript-eslint
- [ ] Add Prettier for consistent formatting
- [ ] Configure Vitest for testing
```

## Type System Quick Reference

### Primitive Types

```typescript
const name: string = "Alice";
const age: number = 30;
const active: boolean = true;
const id: bigint = 9007199254740991n;
const key: symbol = Symbol("unique");
```

### Union and Intersection Types

```typescript
// Union: value can be one of several types
type Status = "pending" | "approved" | "rejected";

// Intersection: value must satisfy all types
type Employee = Person & { employeeId: string };

// Discriminated union for type-safe handling
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function handleResult<T>(result: Result<T>): T | null {
  if (result.success) {
    return result.data; // TypeScript knows data exists here
  }
  console.error(result.error);
  return null;
}
```

### Type Guards

```typescript
// typeof guard
function process(value: string | number): string {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value.toFixed(2);
}

// Custom type guard
interface User { type: "user"; name: string }
interface Admin { type: "admin"; permissions: string[] }

function isAdmin(person: User | Admin): person is Admin {
  return person.type === "admin";
}
```

### The `satisfies` Operator (TS 5.0+)

Validate type conformance while preserving inference:

```typescript
// Problem: Type assertion loses specific type info
const colors1 = {
  red: "#ff0000",
  green: "#00ff00"
} as Record<string, string>;

colors1.red.toUpperCase(); // OK, but red could be undefined

// Solution: satisfies preserves literal types
const colors2 = {
  red: "#ff0000",
  green: "#00ff00"
} satisfies Record<string, string>;

colors2.red.toUpperCase(); // OK, and TypeScript knows red exists
```

## Generics Patterns

### Basic Generic Function

```typescript
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const num = first([1, 2, 3]);     // number | undefined
const str = first(["a", "b"]);   // string | undefined
```

### Constrained Generics

```typescript
interface HasLength {
  length: number;
}

function logLength<T extends HasLength>(item: T): T {
  console.log(item.length);
  return item;
}

logLength("hello");     // OK: string has length
logLength([1, 2, 3]);   // OK: array has length
logLength(42);          // Error: number has no length
```

### Generic API Response Wrapper

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
  timestamp: Date;
}

async function fetchUser(id: string): Promise<ApiResponse<User>> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return {
    data,
    status: response.status,
    timestamp: new Date()
  };
}
```

## Utility Types Reference

| Type | Purpose | Example |
|------|---------|---------|
| `Partial<T>` | All properties optional | `Partial<User>` |
| `Required<T>` | All properties required | `Required<Config>` |
| `Pick<T, K>` | Select specific properties | `Pick<User, "id" \| "name">` |
| `Omit<T, K>` | Exclude specific properties | `Omit<User, "password">` |
| `Record<K, V>` | Object with typed keys/values | `Record<string, number>` |
| `ReturnType<F>` | Extract function return type | `ReturnType<typeof fn>` |
| `Parameters<F>` | Extract function parameters | `Parameters<typeof fn>` |
| `Awaited<T>` | Unwrap Promise type | `Awaited<Promise<User>>` |

## Conditional Types

```typescript
// Basic conditional type
type IsString<T> = T extends string ? true : false;

// Extract array element type
type ArrayElement<T> = T extends (infer E)[] ? E : never;

type Numbers = ArrayElement<number[]>; // number
type Strings = ArrayElement<string[]>; // string

// Practical: Extract Promise result type
type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;
```

## Mapped Types

```typescript
// Make all properties readonly
type Immutable<T> = {
  readonly [K in keyof T]: T[K];
};

// Make all properties nullable
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

// Create getter functions for each property
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

interface Person { name: string; age: number }
type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number }
```

## Framework Integration

### React with TypeScript

```typescript
// Typed functional component
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

const Button: React.FC<ButtonProps> = ({ label, onClick, variant = "primary" }) => (
  <button className={variant} onClick={onClick}>
    {label}
  </button>
);

// Typed hooks
const [count, setCount] = useState<number>(0);
const userRef = useRef<HTMLInputElement>(null);
```

### NestJS with TypeScript

```typescript
// Type-safe DTO with class-validator
import { IsString, IsEmail, MinLength } from 'class-validator';

class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;
}

// Or with Zod (modern approach)
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email()
});

type CreateUserDto = z.infer<typeof CreateUserSchema>;
```

See [react-integration.md](references/react-integration.md) and [nestjs-integration.md](references/nestjs-integration.md) for detailed patterns.

## Validation with Zod

```typescript
import { z } from 'zod';

// Define schema
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin", "moderator"]),
  createdAt: z.coerce.date()
});

// Infer TypeScript type from schema
type User = z.infer<typeof UserSchema>;

// Validate at runtime
function parseUser(data: unknown): User {
  return UserSchema.parse(data); // Throws ZodError if invalid
}

// Safe parsing (returns result object)
const result = UserSchema.safeParse(data);
if (result.success) {
  console.log(result.data); // Typed as User
} else {
  console.error(result.error.issues);
}
```

## Modern Toolchain (2025)

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 5.9+ | Type checking and compilation |
| Node.js | 22 LTS | Runtime environment |
| Vite | 7.x | Build tool and dev server |
| pnpm | 9.x | Package manager |
| ESLint | 9.x | Linting with flat config |
| Vitest | 3.x | Testing framework |
| Prettier | 3.x | Code formatting |

### ESLint Flat Config (ESLint 9+)

```javascript
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
```

## Migration Strategies

### Incremental Migration

1. Add `allowJs: true` and `checkJs: false` to tsconfig.json
2. Rename files from `.js` to `.ts` one at a time
3. Add type annotations gradually
4. Enable stricter options incrementally

### JSDoc for Gradual Typing

```javascript
// Before full migration, use JSDoc
/**
 * @param {string} name
 * @param {number} age
 * @returns {User}
 */
function createUser(name, age) {
  return { name, age };
}
```

See [enterprise-patterns.md](references/enterprise-patterns.md) for comprehensive migration guides.

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `any` liberally | Defeats type safety | Use `unknown` and narrow |
| Ignoring strict mode | Misses null/undefined bugs | Enable all strict options |
| Type assertions (`as`) | Can hide type errors | Use `satisfies` or guards |
| Enum for simple unions | Generates runtime code | Use literal unions instead |
| Not validating API data | Runtime type mismatches | Use Zod at boundaries |

## Cross-Language Comparison

| Feature | TypeScript | Java | Python |
|---------|------------|------|--------|
| Type System | Structural | Nominal | Gradual (duck typing) |
| Nullability | Explicit (`T \| null`) | `@Nullable` annotations | Optional via typing |
| Generics | Type-level, erased | Type-level, erased | Runtime via typing |
| Interfaces | Structural matching | Must implement | Protocol (3.8+) |
| Enums | Avoid (use unions) | First-class | Enum class |

## Reference Files

- [type-system.md](references/type-system.md) — Complete type system guide
- [generics.md](references/generics.md) — Advanced generics patterns
- [enterprise-patterns.md](references/enterprise-patterns.md) — Error handling, validation, architecture
- [react-integration.md](references/react-integration.md) — React + TypeScript patterns
- [nestjs-integration.md](references/nestjs-integration.md) — NestJS API development
- [toolchain.md](references/toolchain.md) — Modern build tools configuration

## Assets

- [tsconfig-template.json](assets/tsconfig-template.json) — Strict enterprise config
- [eslint-template.js](assets/eslint-template.js) — ESLint 9 flat config

## Scripts

- [validate-setup.sh](scripts/validate-setup.sh) — Verify TypeScript environment
