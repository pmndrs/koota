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

### Ephemeral Transform

When a remote user is actively transforming a shape (dragging, resizing, rotating), an ephemeral transform previews the change before it commits. This is separate from presence—presence is about the user, ephemeral transform is about the object being manipulated.

```mermaid
erDiagram
  "User" ||--o| "EphemeralTransform" : owns
  "EphemeralTransform" }o--|| "Shape" : applies_to

  "EphemeralTransform" {
    float deltaX "Position offset"
    float deltaY "Position offset"
    float scaleX "Scale multiplier, default 1"
    float scaleY "Scale multiplier, default 1"
    float rotation "Rotation offset in degrees, default 0"
  }
```

Notes:

- **Exclusive**: Only one user can transform a shape at a time.
- **Ephemeral**: Not persisted. Cleared when the transform commits or the user disconnects.
- **Distinct from selection**: Selecting a shape does not imply transforming it.

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
