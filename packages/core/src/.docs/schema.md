Koota has a just-enough design philosophy, but what does this mean in the context of traits and storage?

### Terminology

**Definition** - The input format users write when calling `trait()`. Can be shorthand values (`{ x: 0 }`), FieldDescriptor format (`{ x: { kind: 'number', default: 0 } }`), or a mix of both.

**FieldDescriptor** - The canonical format for a single field: `{ kind, default, ... }`. Extensible with custom properties.

**Schema** - A collection of FieldDescriptors. The source of truth after parsing a Definition.

### Design Principles

- **Data shape** is enforced at compile time via the TS type system.
- The definition passed into a trait defines how to **construct** the data. For scalar values this is just the default value, but for ref values this is a factory function that returns the initialized memory. Types can be inferred from this schema.
- A schema is built from the passed in definition. Users can enter the schema format themselves as a collection of field descriptors. Helpers can be made that also do this.
- **Storage**, **accessors** and a **constructor** are built from the schema.
- The schema is extensible to allow users to build their own integrations with custom field descriptors.
- There will be `onSet`, `onAdd`, `onRemove` hooks. For example, constraining the position values `onSet` so that they can never be less than 0.

### API

The schema uses runtime JS reflection and is limited to what can be accomplished with this. For example, all ref types, that is types that store pointers in an array, are simply marked `ref` without differentiating between objects, arrays, etc.

```ts
const Ball = trait({
  radius: 10,
  color: () => ({ r: 0, g: 0, b: 0 }),
}

Ball.schema = {
	radius: { kind: 'number', default: 10 },
	color: { kind: 'ref', default: () => ({ r: 0, g: 0, b: 0 }) },
}

Ball.constructor = (input) => ({
  radius: input.radius ? 10,
  color: input.color ? () => ({ r: 0, g: 0, b: 0 }),
})

// store: { radius: number[]; color: { r: number; g: number; b: number; }[] }
```

Explicit field descriptors can be defined with a helper, but we have not found a reason to require this yet and it then complicates the API space. For cases where types need to be more specific, like tuples, this can be done without `as` type casting with this format:

```ts
const Ball = trait({
  radius: 10,
  color: () => ({ r: 0, g: 0, b: 0 }),
  tuple: (): [number, number, number] => [0, 0, 0],
  names: (): string[] => [],
})
```

Or else, a type can be passed in to the generic.

```ts
type Ball = {
  radius: number
  color: { r: number; g: number; b: number }
  tuple: [number, number, number]
  names: string[]
}

const Ball = trait<Ball>({
  radius: 10,
  color: () => ({ r: 0, g: 0, b: 0 }),
  tuple: () => [0, 0, 0],
  names: () => [],
})

Ball.schema = {
  radius: { kind: 'number', default: 10 },
  color: { kind: 'ref', default: () => ({ r: 0, g: 0, b: 0 }) },
  tuple: { kind: 'ref', default: () => [0, 0, 0] },
  names: { kind: 'ref', default: () => [] },
}
```

Some data requires context to construct. In these cases the user must provide the constructed data themselves when adding the trait. We mark this by requiring it.

```ts
const Sound = trait({
	name: required<string>(), // Probably just returns the expanded schema
	source: required<AudioSource>(),
    volume: 1,
});

entity.add(Sound({ name: 'sfx', source: new AudioSource(ctx) }));

Sound.schema = {
	// Should we just assume all required are 'ref'?
	name: { kind: 'ref', required: true },
	source: { kind: 'ref', required: true },
	volume: { kind: 'number' },
}

// When required, we maybe return null?
// We want this to be extremely optimized, but maybe it throws instead.
Sound.constructor = (input) => ({
  name: input.name ? null,
  source: input.color ? null,
  volume: input.volume ? 1,
})
```

Hooks are per-trait instead of per-world and intended to allow for validation of the data and any customizations required to get custom storage working, but **not** any logic.

```ts
const Position = trait({ x: 0, y: 0 })

// Enforce that position values can never be less than 0.
Position.onSet((value) => {
  if (value.x) value.x = Math.max(0, value.x)
  if (value.y) value.y = Math.max(0, value.y)
})
Position.onAdd()
Position.onRemove()
```

Finally, we have buffers. Buffers are rarely used and complicate code on the JS main thread. We don't expect it to be a common interface but do want to support creating stores with buffers instead of native JS arrays. A `buffer` helper is used.

```ts
// By default a Float64 is created since this interops cleanly with JS numbers.
const Position = trait({ x: type.buffer, y: type.buffer })
// store: { x: Float64Array, y: Float64Array }
// get(): { x: number, y: number }

// Specific types can be specified with dot notation.
// Can call as a function for default values.
const Position = trait({ x: type.buffer.f32(1), y: type.buffer.f32(1) })
// store: { x: Float32Array, y: Float32Array }
// get(): { x: number, y: number }
```

> [!NOTE] Why there are no scalar stores
> A trait needs to always return a ref with `get` or else `updateEach` will not work properly. This is because `updateEach` keeps the reference in the parent scope and once the callback finishes running, writes it back to the store. A scalar value copies into the new scope and so the parent scope will not see the updates.

So far all storage is a struct of arrays. Some of the arrays are scalars, some refs and others buffers. We recommend all types be scalar as much as possible for cache optimization purposes, but the storage system allows all approaches. Optionally, a trait can be a single array of refs. This is mostly for compatibility with third party libraries built with classes and cannot be decomposed into scalars.

```ts
// Creates a Three Vector3 per entity
const Velocity = trait(() => new THREE.Vector3())

// Can also be required instead to capture external refs
const Ref = trait(() => required<THREE.Object3d>())

// An Object3D instance must be passed in
entity.add(Ref(mesh))
```

Shorthand values in a definition get parsed into field descriptors. Alternatively, a user can write field descriptor format directly and skip shorthand.

```ts
const Position = trait({
  x: { kind: 'number', default: 0 },
  y: { kind: 'number', default: 0 },
})
```

A user can create their own schema extensions with helpers that return type compliant field ASTs. Hooks can be defined on a per-field basis. And then they can be shared!!!

```ts
const clamped = (value: number, min: number, max: number) => ({
  kind: 'number',
  default: () => value,
  min,
  max,
  onSet: (v: number) => Math.max(min, Math.min(max, v)),
})

const Health = trait({
  current: clamped(100, 0, 100),
  max: clamped(100, 0, 100),
})

entity.set(Health, { current: 150 }) // Clamped to 100
```

Hooks can be used with schema libraries like `zod` and `valibot`.

```ts
const zodSchema = z.object({ x: z.number(), y: z.number() })
type ZodType = z.infer<typeof zodSchema>

// Ref store that requires an object that matches the zod schema
const PacketStuff = trait(required<ZodType>())

PacketStuff.onSet((value) => {
  zodSchema.parse(value)
})
```

Or this can now be turned into its own userland extension.

```ts
const zod = <T extends z.ZodType>(schema: T, defaultValue?: z.infer<T>) => ({
  kind: 'ref',
  default: defaultValue !== undefined ? () => schema.parse(defaultValue) : undefined,
  required: defaultValue === undefined,
  onSet: (v: z.infer<T>) => schema.parse(v),
})

// With default
const Position = trait({
  data: zod(zodSchema, { x: 0, y: 0 }),
})
```
