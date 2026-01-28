# Enterprise Patterns Reference

> **Load when:** User asks about error handling, validation, project architecture, migration strategies, or large-scale TypeScript patterns.

Proven patterns for building maintainable TypeScript applications.

## Contents

- [Error Handling](#error-handling)
- [Validation Patterns](#validation-patterns)
- [Project Organization](#project-organization)
- [Migration Strategies](#migration-strategies)
- [Security Patterns](#security-patterns)

---

## Error Handling

### Result Type Pattern

Instead of throwing exceptions, return typed results:

```typescript
// Define Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Helper functions
function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// Usage
interface ValidationError {
  field: string;
  message: string;
}

function parseEmail(input: string): Result<string, ValidationError> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(input)) {
    return err({ field: "email", message: "Invalid email format" });
  }

  return ok(input.toLowerCase());
}

// Consuming Result
const result = parseEmail(userInput);

if (result.success) {
  console.log(`Valid email: ${result.data}`);
} else {
  console.error(`Error in ${result.error.field}: ${result.error.message}`);
}
```

### Typed Error Classes

```typescript
// Base application error
abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;

  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`);
  }
}

class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly fields: Record<string, string[]>
  ) {
    super(message);
  }
}

class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;

  constructor(message = "Authentication required") {
    super(message);
  }
}

// Type guard for app errors
function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Error handler
function handleError(error: unknown): { status: number; body: object } {
  if (isAppError(error)) {
    return {
      status: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error instanceof ValidationError && { fields: error.fields })
      }
    };
  }

  console.error("Unexpected error:", error);
  return {
    status: 500,
    body: { code: "INTERNAL_ERROR", message: "Internal server error" }
  };
}
```

---

## Validation Patterns

### Zod Schema Validation

```typescript
import { z } from 'zod';

// Define schemas
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(["user", "admin", "moderator"]),
  metadata: z.record(z.string()).optional()
});

// Infer TypeScript type
type User = z.infer<typeof UserSchema>;

// Create DTO schemas
const CreateUserSchema = UserSchema.omit({ id: true });
type CreateUserDto = z.infer<typeof CreateUserSchema>;

const UpdateUserSchema = UserSchema.partial().omit({ id: true });
type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

// Validation functions
function validateCreateUser(data: unknown): Result<CreateUserDto, z.ZodError> {
  const result = CreateUserSchema.safeParse(data);

  if (result.success) {
    return ok(result.data);
  }

  return err(result.error);
}

// Transform Zod errors to user-friendly format
function formatZodError(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}
```

### Branded Types for Validation

```typescript
// Branded/Nominal types
declare const EmailBrand: unique symbol;
type Email = string & { readonly [EmailBrand]: true };

declare const UserIdBrand: unique symbol;
type UserId = string & { readonly [UserIdBrand]: true };

// Validation functions that return branded types
function validateEmail(input: string): Email {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input)) {
    throw new ValidationError("Invalid email", { email: ["Invalid format"] });
  }
  return input as Email;
}

function validateUserId(input: string): UserId {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(input)) {
    throw new ValidationError("Invalid user ID", { id: ["Must be UUID"] });
  }
  return input as UserId;
}

// Usage: Functions require validated types
function sendEmail(to: Email, subject: string): void {
  // to is guaranteed to be valid email
}

function getUser(id: UserId): Promise<User> {
  // id is guaranteed to be valid UUID
}

// Compiler enforces validation
sendEmail("invalid", "Hello");           // Error: string not assignable to Email
sendEmail(validateEmail("a@b.com"), "Hello"); // OK
```

---

## Project Organization

### Feature-Based Structure

```
src/
├── features/
│   ├── users/
│   │   ├── index.ts           # Public exports (barrel)
│   │   ├── user.types.ts      # Types and interfaces
│   │   ├── user.schema.ts     # Zod schemas
│   │   ├── user.service.ts    # Business logic
│   │   ├── user.repository.ts # Data access
│   │   ├── user.controller.ts # HTTP handlers
│   │   └── __tests__/
│   │       ├── user.service.test.ts
│   │       └── user.controller.test.ts
│   ├── auth/
│   │   ├── index.ts
│   │   ├── auth.types.ts
│   │   └── ...
│   └── posts/
│       └── ...
├── shared/
│   ├── types/
│   │   ├── result.ts
│   │   └── pagination.ts
│   ├── utils/
│   │   ├── validation.ts
│   │   └── date.ts
│   └── errors/
│       └── app-error.ts
├── infrastructure/
│   ├── database/
│   │   └── client.ts
│   ├── cache/
│   │   └── redis.ts
│   └── logging/
│       └── logger.ts
└── config/
    ├── index.ts
    └── env.ts
```

### Barrel Exports

```typescript
// features/users/index.ts
export type { User, CreateUserDto, UpdateUserDto } from './user.types';
export { UserSchema, CreateUserSchema } from './user.schema';
export { UserService } from './user.service';
export { UserController } from './user.controller';

// Don't export repository (internal detail)
// Don't export internal helper functions

// Usage in other modules
import { User, UserService } from '@/features/users';
```

### Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@features/*": ["src/features/*"],
      "@shared/*": ["src/shared/*"],
      "@config/*": ["src/config/*"]
    }
  }
}
```

---

## Migration Strategies

### Incremental Migration from JavaScript

**Phase 1: Enable TypeScript alongside JavaScript**

```json
// tsconfig.json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "outDir": "./dist",
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": false,
    "noImplicitAny": false
  },
  "include": ["src/**/*"]
}
```

**Phase 2: Rename files gradually**

```bash
# Convert one file at a time
mv src/utils/helpers.js src/utils/helpers.ts

# Add minimal type annotations
# Fix any type errors
# Run tests to verify
```

**Phase 3: Enable stricter checks incrementally**

```json
// Progression of strict options
{
  "compilerOptions": {
    // Step 1: Basic strictness
    "noImplicitAny": true,

    // Step 2: Null safety
    "strictNullChecks": true,

    // Step 3: Full strict mode
    "strict": true,

    // Step 4: Extra safety (optional)
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### JSDoc for Gradual Typing

```javascript
// Before full migration, use JSDoc
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 */

/**
 * Find user by ID
 * @param {string} id - User ID
 * @returns {Promise<User | null>}
 */
async function findUser(id) {
  // implementation
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T | undefined}
 */
function first(items) {
  return items[0];
}
```

### CommonJS to ESM Migration

```json
// package.json
{
  "type": "module"
}
```

```typescript
// Before (CommonJS)
const express = require('express');
const { UserService } = require('./user.service');
module.exports = { router };

// After (ESM)
import express from 'express';
import { UserService } from './user.service.js'; // Note .js extension
export { router };
```

---

## Security Patterns

### Input Sanitization

```typescript
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Sanitized string schema
const SanitizedString = z.string().transform((val) => {
  return DOMPurify.sanitize(val.trim());
});

// HTML content schema (for rich text)
const HtmlContentSchema = z.string().transform((val) => {
  return DOMPurify.sanitize(val, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target']
  });
});

// SQL-safe identifier
const SafeIdentifierSchema = z.string().regex(
  /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  "Invalid identifier"
);
```

### Type-Safe Environment Variables

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().optional()
});

// Validate on startup
function loadEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

// Usage: fully typed
env.PORT;        // number
env.NODE_ENV;    // "development" | "production" | "test"
env.REDIS_URL;   // string | undefined
```

### Secure API Response Types

```typescript
// Never expose internal fields
interface InternalUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  internalNotes: string;
}

// Public API response (Pick only safe fields)
type PublicUser = Pick<InternalUser, 'id' | 'name' | 'email'>;

// Or explicitly define
interface UserResponse {
  id: string;
  name: string;
  email: string;
}

// Transform function
function toPublicUser(user: InternalUser): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}
```

### Rate Limiting Types

```typescript
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

const rateLimits: Record<string, RateLimitConfig> = {
  api: { windowMs: 60000, maxRequests: 100 },
  auth: { windowMs: 300000, maxRequests: 5 },
  upload: { windowMs: 3600000, maxRequests: 10 }
} as const satisfies Record<string, RateLimitConfig>;
```
