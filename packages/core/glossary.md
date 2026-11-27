# Glossary

At its core, Koota is a **world** that owns **entities** and gives them data through **traits**. A trait is defined once and shared, and each world that uses it owns the **storage** for that trait's records. **Relations**, **identifiers** and **machines** are traits with something more. A relation links one entity to another, an identifier gives an entity a key, and a machine holds an entity in one state at a time. A **query** is also defined once, and each world owns the set of entities that match it. A **view** is a sequence of entities that can be walked with their records. A query supplies one, an ordered relation keeps one, and sorting a query derives another. Anything that changes what an entity holds is a **command**. The domain that owns the data defines the command, and the world owns the buffer that decides when it applies. **Actions** are operations a user names and binds to a world.

**[World](src/world/)**. The runtime context that owns a set of entities and their data. Worlds can share trait definitions. Each query runs against one world. By default, worlds share a page table that maps entity pages to their owners. An isolated world has its own page table and entity ID space.

**[Entity](src/entity/)**. A handle used to look up all the records and relations belonging to one entity in a world. The handle stays the same as that data changes. Entity ids are leased to worlds in **pages** of 1024, and per-entity state is stored by page. A **hook** calls back at a point in a lifecycle. The entity hooks `onEntitySpawn` and `onEntityDestroy` report an entity being created and destroyed.

**[Trait](src/trait/)**. A named kind of data an entity can have. The `Position` **definition** describes its `x` and `y` fields. A **record** holds one entity’s coordinates, such as `{ x: 3, y: 4 }`. For a tag such as `Selected`, presence alone is the data. The trait hooks `onAdd`, `onRemove` and `onChange` report an entity gaining, losing or writing a trait.

**[Storage](src/storage/)**. The layout of a trait’s data. Positions can be stored by field, with separate columns for `x` and `y`, or as one coordinate object per entity.

**[Relation](src/relation/)**. A directed link from one entity to another. The link can carry its own record, such as the quantity of an item in a particular inventory.

**[Identifier](src/identifier/)**. A namespace of keys for looking up entities in a world. Within a scope, an exclusive identifier gives each key at most one owner. A shared identifier allows several entities to use the same key.

**[Machine](src/machine/)**. A set of state traits that allows exactly one active state per entity using the machine. A transition changes that state, and a query can match it like any other trait. The machine hook `onTransition` reports each transition.

**[Query](src/query/)**. A definition of which entities to select, such as those with both `Position` and `Velocity`. Worlds can share the same query, and each world has its own matching entities. The query hooks `onEnter` and `onExit` report an entity starting or ceasing to match.

**[View](src/view/)**. A sequence of entities that can be walked with their records. A query supplies its matching entities and an ordered relation keeps a list. Sorting a query derives a new order, while sorting an ordered relation reorders its list in place. A view chooses which traits a walk hands back, so it can expose just positions even when velocity is also required to match.

**[Command](src/command/)**. A change to what an entity holds or whether it exists, such as add, remove and destroy. Each domain defines its own commands. Inside a walk, a hook or `world.defer` a command joins the **buffer** and applies in call order when the outermost scope ends, so a walk never loses a row. Outside a scope it applies at once.

**[Actions](src/actions.ts)**. A group of named operations that read or write a world’s data. An action such as `equip` can link a character to an item and update the character’s traits.
