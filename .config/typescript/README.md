# `@config/typescript`

These are base shared `tsconfig.json`s from which all other `tsconfig.json`s inherit.

## Usage

In your package's `tsconfig.json`:

```json
{
  "extends": "@config/typescript/app.json",
  "include": ["src/**/*", "tests"]
}
```

## Available Configs

- `base.json` - Common TypeScript compiler options
- `app.json` - For browser/DOM code (extends base)
- `node.json` - For Node.js code (extends base)
- `react.json` - For React projects with JSX (extends app)
