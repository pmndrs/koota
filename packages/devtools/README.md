# @koota/devtools

A floating panel for inspecting a koota world: its entities, traits and relations.

## Layout

The UI is split into layers that only depend downward.

| Layer                   | Knows about  | Purpose                                                                             |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `devtools/ui`           | React        | Presentational primitives. Panel, sheet, rows, buttons, badges, page sections.      |
| `devtools/model`        | koota        | Pure helpers that read trait and entity metadata. No React, no side effects.        |
| `devtools/state`        | koota, React | Hooks that subscribe to the world, the navigation machine, and highlight tags.      |
| `devtools/views`        | all of above | The screens: entity list and detail, trait list and detail, relation graph, header. |
| `devtools/devtools.tsx` | views, state | Composition root. Owns navigation and hands each screen the events it can send.     |

`ui/theme.module.css` is the only place colors, sizes and radii are defined. Components reference tokens, never raw values.

## Navigation

`state/nav.ts` is a finite state machine. The five screens and the events that move between them are listed in a transition table next to `transition()`, and `tests/nav.test.ts` walks every cell of that table. Screens never decide where to go; they send an event and the machine answers.

## Highlighting

`state/use-highlight.ts` mirrors what the panel is doing onto the world as tags an app can query: `IsDevtoolsHovered` and `IsDevtoolsSelected` on entities, and `IsDevtoolsHovering`, `IsDevtoolsSelecting` and `IsDevtoolsHighlighting` on the world. One controller owns the hovered entity so rows can come and go without leaving a stale tag behind.
