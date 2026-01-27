# Operations Model

Operations (ops) are semantic mutations exchanged between client and server. Each op targets a shape by stable ID and carries a server-assigned sequence number for ordering.

## Design principles

- **Semantic, not structural**: Ops describe intent ("move shape") rather than raw state changes.
- **Invertible**: Update ops carry previous values so they can be inverted for local undo.
- **Replayable**: Given a checkpoint and ordered ops, any client can reconstruct the same state.
- **Server-sequenced**: The server assigns sequence numbers; `0` means unassigned (optimistic/local).

## Ops

### Lifecycle

| Op          | Purpose                                      |
| ----------- | -------------------------------------------- |
| CreateShape | Spawn a new shape with initial properties    |
| DeleteShape | Remove a shape (carries full state for undo) |

### Property updates

| Op             | Purpose                     |
| -------------- | --------------------------- |
| UpdatePosition | Move a shape                |
| UpdateRotation | Rotate a shape              |
| UpdateScale    | Resize a shape              |
| UpdateColor    | Change a shape's fill color |

All update ops include previous values to enable inversion.
