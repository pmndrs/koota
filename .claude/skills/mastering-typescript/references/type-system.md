# TypeScript Type System Reference

> **Load when:** User asks about type annotations, interfaces vs types, unions, intersections, or type system fundamentals.

Complete guide to TypeScript's structural type system.

## Contents

- [Type Annotations](#type-annotations)
- [Interfaces vs Type Aliases](#interfaces-vs-type-aliases)
- [Union and Intersection Types](#union-and-intersection-types)
- [Literal Types](#literal-types)
- [Type Guards and Narrowing](#type-guards-and-narrowing)
- [The satisfies Operator](#the-satisfies-operator)

---

## Type Annotations

### Variable Annotations

```typescript
// Explicit type annotations
const name: string = "Alice";
const age: number = 30;
const active: boolean = true;

// Type inference (preferred when obvious)
const inferredName = "Bob";  // TypeScript infers string
const inferredAge = 25;      // TypeScript infers number

// Arrays
const numbers: number[] = [1, 2, 3];
const strings: Array<string> = ["a", "b", "c"];

// Tuples (fixed-length arrays with specific types)
const pair: [string, number] = ["age", 30];
const triple: [string, number, boolean] = ["name", 1, true];
```

### Function Annotations

```typescript
// Function with typed parameters and return
function greet(name: string): string {
  return `Hello, ${name}!`;
}

// Arrow function
const add = (a: number, b: number): number => a + b;

// Optional parameters
function greetOptional(name: string, greeting?: string): string {
  return `${greeting ?? "Hello"}, ${name}!`;
}

// Default parameters
function greetDefault(name: string, greeting: string = "Hello"): string {
  return `${greeting}, ${name}!`;
}

// Rest parameters
function sum(...numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}

// Function type alias
type Comparator<T> = (a: T, b: T) => number;
const numberCompare: Comparator<number> = (a, b) => a - b;
```

---

## Interfaces vs Type Aliases

### When to Use Interfaces

```typescript
// Interfaces are ideal for object shapes
interface User {
  id: string;
  name: string;
  email: string;
}

// Interfaces can be extended
interface Employee extends User {
  employeeId: string;
  department: string;
}

// Interfaces can be implemented by classes
class Manager implements Employee {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public employeeId: string,
    public department: string
  ) {}
}

// Declaration merging (interfaces only)
interface Config {
  apiUrl: string;
}

interface Config {
  timeout: number;
}

// Config now has both apiUrl and timeout
```

### When to Use Type Aliases

```typescript
// Type aliases for unions
type Status = "pending" | "approved" | "rejected";

// Type aliases for complex types
type Handler = (event: Event) => void;

// Type aliases for mapped types
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Type aliases for conditional types
type NonNullable<T> = T extends null | undefined ? never : T;

// Type aliases for tuples
type Point = [x: number, y: number];
type RGB = [red: number, green: number, blue: number];
```

### Decision Guide

| Use Case | Prefer |
|----------|--------|
| Object shapes | `interface` |
| Extending objects | `interface` |
| Class contracts | `interface` |
| Union types | `type` |
| Tuple types | `type` |
| Mapped types | `type` |
| Conditional types | `type` |
| Primitive aliases | `type` |

---

## Union and Intersection Types

### Union Types

```typescript
// Value can be one of several types
type StringOrNumber = string | number;

// Discriminated unions (tagged unions)
interface Dog {
  kind: "dog";
  bark(): void;
}

interface Cat {
  kind: "cat";
  meow(): void;
}

type Pet = Dog | Cat;

function speak(pet: Pet): void {
  switch (pet.kind) {
    case "dog":
      pet.bark();
      break;
    case "cat":
      pet.meow();
      break;
  }
}
```

### Intersection Types

```typescript
// Value must satisfy all types
interface HasName {
  name: string;
}

interface HasAge {
  age: number;
}

type Person = HasName & HasAge;

const person: Person = {
  name: "Alice",
  age: 30
};

// Practical: Extending with additional properties
type WithTimestamp<T> = T & { createdAt: Date; updatedAt: Date };

interface Article {
  title: string;
  content: string;
}

type TimestampedArticle = WithTimestamp<Article>;
```

---

## Literal Types

### String Literals

```typescript
// Specific string values
type Direction = "north" | "south" | "east" | "west";
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

function move(direction: Direction): void {
  console.log(`Moving ${direction}`);
}

move("north"); // OK
move("up");    // Error: Argument of type '"up"' is not assignable
```

### Numeric Literals

```typescript
type DiceRoll = 1 | 2 | 3 | 4 | 5 | 6;
type BinaryDigit = 0 | 1;

function roll(): DiceRoll {
  return Math.ceil(Math.random() * 6) as DiceRoll;
}
```

### Template Literal Types

```typescript
// Construct string literal types
type EventName = "click" | "hover" | "focus";
type HandlerName = `on${Capitalize<EventName>}`;
// "onClick" | "onHover" | "onFocus"

// CSS unit types
type CSSUnit = "px" | "em" | "rem" | "%";
type CSSValue = `${number}${CSSUnit}`;

const width: CSSValue = "100px";   // OK
const height: CSSValue = "50%";    // OK
const bad: CSSValue = "100";       // Error
```

---

## Type Guards and Narrowing

### Built-in Type Guards

```typescript
function process(value: string | number | null): string {
  // typeof guard
  if (typeof value === "string") {
    return value.toUpperCase();
  }

  // typeof guard for number
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  // null/undefined narrowing
  if (value === null) {
    return "null";
  }

  // Exhaustiveness check
  const _exhaustive: never = value;
  throw new Error(`Unhandled case: ${_exhaustive}`);
}
```

### instanceof Guard

```typescript
class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

class ValidationError extends Error {
  constructor(public fields: string[]) {
    super("Validation failed");
  }
}

function handleError(error: Error): void {
  if (error instanceof ApiError) {
    console.log(`API Error ${error.statusCode}: ${error.message}`);
  } else if (error instanceof ValidationError) {
    console.log(`Validation Error on fields: ${error.fields.join(", ")}`);
  } else {
    console.log(`Unknown error: ${error.message}`);
  }
}
```

### Custom Type Guards

```typescript
interface User {
  type: "user";
  name: string;
}

interface Admin {
  type: "admin";
  name: string;
  permissions: string[];
}

type Account = User | Admin;

// Type predicate: returns boolean but narrows type
function isAdmin(account: Account): account is Admin {
  return account.type === "admin";
}

function getPermissions(account: Account): string[] {
  if (isAdmin(account)) {
    return account.permissions; // TypeScript knows this is Admin
  }
  return [];
}
```

### Assertion Functions

```typescript
function assertDefined<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) {
    throw new Error(message);
  }
}

function processUser(user: User | undefined): void {
  assertDefined(user, "User is required");
  // After assertion, user is narrowed to User
  console.log(user.name);
}
```

---

## The satisfies Operator

### Problem: Type Assertions Hide Bugs

```typescript
// Using 'as' can hide type errors
const config = {
  port: 3000,
  host: "localhost"
} as Record<string, string | number>;

// No error, but port is now string | number
const portString = config.port.toFixed(2); // Runtime error if port is string!
```

### Solution: satisfies Validates Without Widening

```typescript
// satisfies checks conformance but preserves literal types
const config = {
  port: 3000,
  host: "localhost"
} satisfies Record<string, string | number>;

// TypeScript knows port is number, host is string
config.port.toFixed(2);      // OK - port is number
config.host.toUpperCase();   // OK - host is string
```

### Practical Use Cases

```typescript
// Color palette with constrained values
const palette = {
  primary: "#007bff",
  secondary: "#6c757d",
  success: "#28a745"
} satisfies Record<string, `#${string}`>;

// TypeScript knows each property exists and is a hex string
palette.primary.startsWith("#"); // OK

// Route configuration
type RouteConfig = {
  path: string;
  method: "GET" | "POST";
  handler: () => void;
};

const routes = {
  home: { path: "/", method: "GET", handler: () => {} },
  login: { path: "/login", method: "POST", handler: () => {} }
} satisfies Record<string, RouteConfig>;

// TypeScript preserves literal types for each route
routes.home.method; // "GET" (not "GET" | "POST")
```

---

## Special Types

### any vs unknown

```typescript
// any: Opt out of type checking (avoid)
let anyValue: any = "hello";
anyValue.toFixed(2); // No error, but crashes at runtime

// unknown: Type-safe any (prefer)
let unknownValue: unknown = "hello";
unknownValue.toFixed(2); // Error: Object is of type 'unknown'

// Must narrow unknown before use
if (typeof unknownValue === "string") {
  unknownValue.toUpperCase(); // OK after narrowing
}
```

### never

```typescript
// never: Represents impossible values
function fail(message: string): never {
  throw new Error(message);
}

// Exhaustiveness checking with never
type Shape = "circle" | "square";

function getArea(shape: Shape): number {
  switch (shape) {
    case "circle":
      return Math.PI;
    case "square":
      return 1;
    default:
      // If we add a new shape, this will error
      const _exhaustive: never = shape;
      throw new Error(`Unknown shape: ${_exhaustive}`);
  }
}
```

### void vs undefined

```typescript
// void: Function doesn't return anything meaningful
function log(message: string): void {
  console.log(message);
}

// undefined: Explicit undefined value
function findUser(id: string): User | undefined {
  return users.get(id);
}
```
