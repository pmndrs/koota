# Multiplayer Editor Architecture

This design is heavily based on Figma's as outlined in these blog posts:

- https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- https://www.figma.com/blog/making-multiplayer-more-reliable/

The **tl;dr** is that the traditional operational transform (OT) strategy utilizing conflict-free replicated data types (CRDTs) works well for documents with no central server and lots of text, but is a poor fit for editor solutions. Especially ones that already have an authoritative server, like L3DA does. Instead, lessons are taken from CRDTs to create low conflict scenarios but a central server does the resolution reducing a lot of overhead and complexity.

## Principles

**Authoritative server.** We use a centralized authoritative server that all clients connect to. We will use WebSockets for this connection. The canonical state is held on the server, and all correctness flows from server sequencing and validation.

**The system favors determinism and recoverability over local autonomy.**  This unifies authoritative server, replay, validation, and durability without adding detail.

**Prefer simple, predictable synchronization semantics.** The system favors a small, domain-appropriate set of deterministic rules over complex general-purpose distributed algorithms, making convergence and failure behavior easy to reason about.

**New clients get synchronized with checkpoints.** A checkpoint is a snapshot of the working file. Restoring and creating checkpoints needs to be deterministic and shared cross-session.

**Durability.** Checkpoints are periodically made every 30-60 seconds. In addition a so-called journal, or an append-only op buffer, is kept for mutations between checkpoints. This enables fast persistence, predictable recovery, and full reconstruction of state at all times.

**Edit offline and reconnect.** Users may edit offline, buffering semantic ops locally. Upon reconnect, clients resynchronize with a fresh authoritative state and deterministically reconcile local edits against it.

**Semantic ops.** Instead of sending snapshots or snapshot partials, semantic ops are used. Ops are self-contained, reference stable server-authoritative entity IDs, and are designed to be simple, explicit, and replayable.

**Server validates ops.** The server validates all ops for correctness, freshness, permissions, and structural consistency before they are accepted into the authoritative stream.

**Deterministic op replay.** All accepted ops are assigned a monotonically increasing server sequence number. Clients converge by apply the same ordered stream.

**Optimistic updates.** To get immediate UX feedback, client updates are applied optimistically while sending the opt to the server. The op can be confirmed committed by the server, or a correction can be received. Responsiveness and authority are treated as equally important goals.

**Corrections are normal, expected, and convergence-preserving.** A correction occurs when the server writes, rewrites or rejects a client op. This causes a rollback to the last confirmed state, applies the authoritative ops in order, and then reapplies pending local ops. This is essentially a rebase.

**Lock-free but scope-isolated edits.** There are no editor locks where only one user can make mutations. Since the editor uses a clear hierarchy, edits can be localized to specific branches. This limits the amount of conflict that is required. Therefore, conflicts are minimized structurally before they are resolved semantically.

**Domain-specific conflict resolution.** While commutative, conflict-free resolutions are preferred, a policy is applied per domain based on its design model. For example, edits to disjoint fields, (color vs position) get applied without conflict. CRDTs like last-writer-wins can be applied conflicting edits on scalar props or set-union/remove for membership to sets.