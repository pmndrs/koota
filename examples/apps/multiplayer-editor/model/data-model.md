# Multiplayer Editor Data Model

## How to read

The data model describes how data is related and what properties it has. It serves as a contract between all platforms. It is **not** a platform-specific implementation, whether in a database or in memory.

Implementations may differ. For example, an in-memory implementation may optimize for read/write performance, pack data into contiguous buffers, or implement only a subset of the model. Regardless of implementation, the defined relationships must hold, and any implemented data must respect the model.

The data model is a living document. Some areas may be underspecified to allow for prototyping or to avoid prematurely fixing details.

## Document

At the root is the Document. A document contains shapes and is synchronized across clients via checkpoints and semantic operations.

```mermaid
erDiagram
  "Document" ||--|{ "Shape" : contains
  "Document" ||--|| "History" : tracks
  "Document" ||--o{ "User" : users

  "Document" {
    int seq "Server sequence number"
  }
```

## User

A Document has zero or more Users. A User represents a collaborator in the session, identified by `clientId`.

```mermaid
erDiagram
  "Document" ||--o{ "User" : users

  "User" {
    string clientId
    string name
  }
```

### Presence

Presence represents the collaboration state like cursor position and selection.

```mermaid
erDiagram
  "User" ||--o| "Presence" : presence
  "User" }o--o{ "Shape" : selects

  "Presence" ||--o| "Cursor" : cursor

  "Presence" {
    int[] selection "Stable Shape IDs"
  }

  "Cursor" {
    float x
    float y
    float targetX "optional (for interpolation/smoothing)"
    float targetY "optional (for interpolation/smoothing)"
  }
```

## Shape

Shapes are the primary content entities. Each shape has a stable ID for cross-client references and supports transformation and color.

```mermaid
erDiagram
  "Shape" ||--|| "Transform" : transformed_by
  "Shape" ||--|| "Color" : styled_by

  "Transform" ||--|| "Position" : position
  "Transform" ||--|| "Rotation" : rotation
  "Transform" ||--|| "Scale" : scale

  "Shape" {
    int id "Stable ID, server-authoritative"
    string type "rect | ellipse"
  }

  "Transform" {
  }

  "Position" {
    float x
    float y
  }

  "Rotation" {
    float angle "degrees"
  }

  "Scale" {
    float x
    float y
  }

  "Color" {
    string fill "hex color"
  }
```
