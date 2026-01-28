# Generics Reference

> **Load when:** User asks about generics, mapped types, conditional types, template literal types, or reusable type patterns.

Advanced generics and type-level programming patterns.

## Contents

- [Generic Fundamentals](#generic-fundamentals)
- [Generic Constraints](#generic-constraints)
- [Mapped Types](#mapped-types)
- [Conditional Types](#conditional-types)
- [Template Literal Types](#template-literal-types)
- [Variadic Tuple Types](#variadic-tuple-types)

---

## Generic Fundamentals

### Basic Generic Function

```typescript
// Type parameter T can be any type
function identity<T>(value: T): T {
  return value;
}

const str = identity("hello");   // string
const num = identity(42);        // number
const obj = identity({ x: 1 });  // { x: number }

// Explicit type argument (rarely needed)
const explicit = identity<string>("hello");
```

### Generic Interfaces

```typescript
interface Container<T> {
  value: T;
  getValue(): T;
  setValue(value: T): void;
}

interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<boolean>;
}

// Implementation
class UserRepository implements Repository<User> {
  async findById(id: string): Promise<User | null> {
    // implementation
  }
  // ... other methods
}
```

### Generic Classes

```typescript
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

const numberStack = new Stack<number>();
numberStack.push(1);
numberStack.push(2);
const top = numberStack.pop(); // number | undefined
```

---

## Generic Constraints

### extends Constraint

```typescript
// T must have a length property
interface HasLength {
  length: number;
}

function logLength<T extends HasLength>(item: T): T {
  console.log(`Length: ${item.length}`);
  return item;
}

logLength("hello");        // OK: string has length
logLength([1, 2, 3]);      // OK: array has length
logLength({ length: 10 }); // OK: object has length
logLength(42);             // Error: number has no length
```

### keyof Constraint

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

interface Person {
  name: string;
  age: number;
}

const person: Person = { name: "Alice", age: 30 };

const name = getProperty(person, "name"); // string
const age = getProperty(person, "age");   // number
const bad = getProperty(person, "email"); // Error: "email" not in Person
```

### Multiple Constraints

```typescript
interface Printable {
  print(): void;
}

interface Loggable {
  log(): string;
}

// T must satisfy both interfaces
function process<T extends Printable & Loggable>(item: T): void {
  item.print();
  console.log(item.log());
}
```

### Default Type Parameters

```typescript
interface ApiResponse<T = unknown, E = Error> {
  data?: T;
  error?: E;
  status: number;
}

// Uses defaults
const response1: ApiResponse = { status: 200 };

// Override data type only
const response2: ApiResponse<User> = { data: user, status: 200 };

// Override both
const response3: ApiResponse<User, ValidationError> = {
  error: new ValidationError(),
  status: 400
};
```

---

## Mapped Types

### Basic Mapped Types

```typescript
// Transform all properties to optional
type Partial<T> = {
  [K in keyof T]?: T[K];
};

// Transform all properties to required
type Required<T> = {
  [K in keyof T]-?: T[K];
};

// Transform all properties to readonly
type Readonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Remove readonly modifier
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
```

### Practical Mapped Types

```typescript
// Make all properties nullable
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

// Make all properties async getters
type AsyncGetters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => Promise<T[K]>;
};

interface User {
  name: string;
  email: string;
}

type UserGetters = AsyncGetters<User>;
// {
//   getName: () => Promise<string>;
//   getEmail: () => Promise<string>;
// }
```

### Key Remapping (as clause)

```typescript
// Filter keys by type
type FilterByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

interface Mixed {
  name: string;
  age: number;
  active: boolean;
  score: number;
}

type StringProps = FilterByType<Mixed, string>;
// { name: string }

type NumberProps = FilterByType<Mixed, number>;
// { age: number; score: number }

// Prefix all keys
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type PrefixedUser = Prefixed<User, "user">;
// { userName: string; userEmail: string }
```

---

## Conditional Types

### Basic Conditional Types

```typescript
// T extends U ? X : Y
type IsString<T> = T extends string ? true : false;

type A = IsString<string>;  // true
type B = IsString<number>;  // false
type C = IsString<"hello">; // true

// Practical: Extract non-nullable type
type NonNullable<T> = T extends null | undefined ? never : T;

type D = NonNullable<string | null>;     // string
type E = NonNullable<number | undefined>; // number
```

### Distributive Conditional Types

```typescript
// Conditional types distribute over unions
type ToArray<T> = T extends unknown ? T[] : never;

type StringOrNumberArray = ToArray<string | number>;
// string[] | number[] (not (string | number)[])

// Prevent distribution with tuple
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;

type Mixed = ToArrayNonDist<string | number>;
// (string | number)[]
```

### infer Keyword

```typescript
// Extract return type
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type FnReturn = ReturnType<() => string>; // string

// Extract array element type
type ArrayElement<T> = T extends (infer E)[] ? E : never;

type Element = ArrayElement<number[]>; // number

// Extract Promise result
type Awaited<T> = T extends Promise<infer R> ? Awaited<R> : T;

type Result = Awaited<Promise<Promise<string>>>; // string

// Extract function first parameter
type FirstParam<T> = T extends (first: infer F, ...rest: any[]) => any ? F : never;

type First = FirstParam<(name: string, age: number) => void>; // string
```

### Practical Conditional Types

```typescript
// API response helper
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Extract data type from result
type ExtractData<T> = T extends { success: true; data: infer D } ? D : never;

type UserResult = ApiResult<User>;
type UserData = ExtractData<UserResult>; // User

// Type-safe event handlers
type EventHandler<T> = T extends `on${infer Event}`
  ? (event: Event) => void
  : never;

type ClickHandler = EventHandler<"onClick">; // (event: "Click") => void
```

---

## Template Literal Types

### Basic Template Literals

```typescript
type Greeting = `Hello, ${string}!`;

const valid: Greeting = "Hello, World!";   // OK
const invalid: Greeting = "Hi, World!";    // Error

// Combine with unions
type Size = "small" | "medium" | "large";
type Color = "red" | "blue" | "green";

type ColoredSize = `${Color}-${Size}`;
// "red-small" | "red-medium" | "red-large" |
// "blue-small" | "blue-medium" | "blue-large" |
// "green-small" | "green-medium" | "green-large"
```

### String Manipulation Types

```typescript
// Built-in string manipulation types
type Upper = Uppercase<"hello">;     // "HELLO"
type Lower = Lowercase<"HELLO">;     // "hello"
type Cap = Capitalize<"hello">;      // "Hello"
type Uncap = Uncapitalize<"Hello">; // "hello"

// Practical: Generate event names
type Event = "click" | "hover" | "focus";
type EventHandler = `on${Capitalize<Event>}`;
// "onClick" | "onHover" | "onFocus"

// CSS property with vendor prefixes
type CSSProp = "transform" | "transition";
type Prefixed = `-webkit-${CSSProp}` | `-moz-${CSSProp}` | CSSProp;
```

### Advanced Template Patterns

```typescript
// Parse dot-notation paths
type PathSegment<T> = T extends `${infer Head}.${infer Tail}`
  ? Head | PathSegment<Tail>
  : T;

type Segments = PathSegment<"user.profile.name">;
// "user" | "profile" | "name"

// HTTP methods with paths
type Method = "GET" | "POST" | "PUT" | "DELETE";
type Endpoint = "/users" | "/posts" | "/comments";

type Route = `${Method} ${Endpoint}`;
// "GET /users" | "GET /posts" | "GET /comments" |
// "POST /users" | ... etc

// Type-safe SQL column references
type Table = "users" | "posts";
type Column<T extends Table> = T extends "users"
  ? "id" | "name" | "email"
  : T extends "posts"
  ? "id" | "title" | "content"
  : never;

type UserColumn = `users.${Column<"users">}`;
// "users.id" | "users.name" | "users.email"
```

---

## Variadic Tuple Types

### Basic Variadic Tuples

```typescript
// Spread tuple types
type Concat<T extends unknown[], U extends unknown[]> = [...T, ...U];

type Combined = Concat<[1, 2], [3, 4]>;
// [1, 2, 3, 4]

// Prepend element
type Prepend<T, U extends unknown[]> = [T, ...U];

type WithFirst = Prepend<0, [1, 2, 3]>;
// [0, 1, 2, 3]

// Append element
type Append<T extends unknown[], U> = [...T, U];

type WithLast = Append<[1, 2, 3], 4>;
// [1, 2, 3, 4]
```

### Practical Variadic Patterns

```typescript
// Typed curry function
type Curry<F> = F extends (...args: infer A) => infer R
  ? A extends [infer First, ...infer Rest]
    ? (arg: First) => Curry<(...args: Rest) => R>
    : R
  : never;

declare function curry<F extends (...args: any[]) => any>(fn: F): Curry<F>;

function add(a: number, b: number, c: number): number {
  return a + b + c;
}

const curriedAdd = curry(add);
const add1 = curriedAdd(1);     // (arg: number) => Curry<...>
const add1and2 = add1(2);       // (arg: number) => number
const result = add1and2(3);     // number (6)

// Typed pipe function
type Pipe<T extends unknown[], R> = T extends [infer First, ...infer Rest]
  ? First extends (arg: R) => infer Next
    ? Pipe<Rest, Next>
    : never
  : R;

function pipe<T extends ((arg: any) => any)[]>(
  ...fns: T
): (arg: Parameters<T[0]>[0]) => Pipe<T, Parameters<T[0]>[0]> {
  return (arg) => fns.reduce((acc, fn) => fn(acc), arg);
}

const process = pipe(
  (n: number) => n * 2,
  (n: number) => n.toString(),
  (s: string) => s.length
);

const length = process(5); // number (2 - length of "10")
```

---

## Built-in Utility Types Reference

| Utility | Purpose | Example |
|---------|---------|---------|
| `Partial<T>` | All properties optional | `Partial<User>` |
| `Required<T>` | All properties required | `Required<Partial<User>>` |
| `Readonly<T>` | All properties readonly | `Readonly<User>` |
| `Pick<T, K>` | Select properties | `Pick<User, "id" \| "name">` |
| `Omit<T, K>` | Exclude properties | `Omit<User, "password">` |
| `Record<K, V>` | Create object type | `Record<string, User>` |
| `Exclude<T, U>` | Remove union members | `Exclude<"a" \| "b", "a">` |
| `Extract<T, U>` | Keep union members | `Extract<"a" \| "b", "a">` |
| `NonNullable<T>` | Remove null/undefined | `NonNullable<string \| null>` |
| `Parameters<F>` | Function parameters | `Parameters<typeof fn>` |
| `ReturnType<F>` | Function return | `ReturnType<typeof fn>` |
| `ConstructorParameters<C>` | Constructor params | `ConstructorParameters<typeof Date>` |
| `InstanceType<C>` | Instance type | `InstanceType<typeof Date>` |
| `Awaited<T>` | Unwrap Promise | `Awaited<Promise<User>>` |
| `NoInfer<T>` | Prevent inference | `NoInfer<T>` (TS 5.4+) |
