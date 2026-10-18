# Warnings

Koota warns when code works but takes a slow path. Warnings never change behavior.

- **Mixed tuples:** a trait whose tuple mixes numbers with other values, such as an Euler with its rotation order, warns once when the trait is created. Its pages store values generically, so every number written to them allocates. Move the other values to their own field to keep the tuple fast. See [tuples](trait.md#Tuples).

Warnings are separate from [assertions](asserts.md). By default, they are enabled unless `process.env.NODE_ENV` is `'production'`. Bundlers normally replace this expression. Direct browser imports without a build step keep warnings enabled.

The published package preserves `__KOOTA_WARNINGS__` so the application's build can choose whether to retain them. For example, in Vite:

```ts
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  define: {
    __KOOTA_WARNINGS__: command === 'serve',
  },
}))
```

Use `true` to keep warnings in a production build. Use `false` to remove them through dead code elimination. Explicitly defining the flag is needed to remove the code completely, because a bundler cannot assume that an undefined optional global will stay undefined at runtime.
