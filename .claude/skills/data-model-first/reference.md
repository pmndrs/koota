# Data Model Standards Reference

## Variant roots
When a root can have multiple variants, avoid polymorphic properties. Use a variant
root that is versioned and constrained by its own schema.

- **Entity**: Stable identity. Typed by `type`, invariant for the entity lifetime.
- **Version**: Unit of change. Owns its data and represents a snapshot or run.
- **Schema**: Versioned contract referenced by the version.
- **Data Model**: Schema-defined data owned by the version.

```mermaid
erDiagram
  "Entity" ||--|{ "Version" : versions

  "Version" ||--|| "Schema" : conforms_to
  "Version" ||--|| "Data Model" : data

  "Entity" {
    string type
  }

  "Schema" {
    string name
    string version
  }

  "Version" {
    string id
    datetime created_at
  }
```

## Computed runs
Computed runs model data derived from other nodes and allow recomputation as
algorithms evolve. A computed run can attach to any node, conforms to a run
schema, and produces output conforming to an output schema.

- **Computed Run**: A single execution of a computation.
- **Run Schema**: Versioned contract for required inputs and parameters.
- **Inputs**: Nodes required to execute the run.
- **Output**: Data produced by the run.

```mermaid
erDiagram
  "Run Schema" ||--|{ "Computed Run" : defines
  "Computed Run" ||--|{ "Input" : consumes
  "Computed Run" ||--|| "Output" : produces
  "Computed Run" ||--|| "Output Schema" : output_conforms_to

  "Run Schema" {
    string name
    string version
  }

  "Computed Run" {
    string id
    string tool
    string tool_version
    string params_hash
    datetime created_at
  }

  "Output Schema" {
    string name
    string version
  }
```
