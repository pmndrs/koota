# Crossfire · 3D tower defense

A playable Koota example with seven inspectable ECS workloads. Each workload comes from a game mechanic, with explicit systems in domain directories modeled on `Dev/minecraft-like`.

```sh
pnpm install
pnpm --filter @examples/tower-defense dev
```

## Play

Protect the crystal through six waves. The example opens with an active defense and autoplay enabled. You can place additional cannon, flame, or frost towers on empty pads, or click an existing tower to upgrade it and see its range. Kills earn gold. Drag to orbit, scroll to zoom, and pause to plan your defenses.

Cannons deal splash damage. Flame towers burn groups and avoid fireproof enemies. Frost towers apply a brief slow. Projectiles spawn and expire naturally, launching from the articulated tower's muzzle matrix. Towers change targets when enemies die or leave range.

The interface has compact scores, icon controls, and three tower choices. Control descriptions appear on hover.

## Minimal devtool

The **</>** button opens a minimizable panel with world setups, scale, seed, autoplay, single-step, and seven workload timings. Apply a setup to restart. Autoplay builds an opening defense and spends earned gold through the same actions as the player. Manual games start empty and paused.

Timings run only while the panel is open. Rows show smoothed CPU milliseconds per simulation tick, including inactive calls. Hover a row for its system names. Full game time includes the supporting systems. Render synchronization is shown separately per rendered frame and excludes GPU drawing. Structural timings include a public query that commits pending query removals.

Every tick advances 1/60 second. The browser runs up to eight ticks per rendered frame, yielding after eight milliseconds of simulation work so the controls stay responsive under load. A single expensive tick can still exceed that budget. All lanes are simulated, with one selectable lane displayed for inspection. These are live gameplay timings: enemy counts and query matches change with combat.

## Seven workloads

| Decision being stressed               | Systems                                                                 | Game mechanic and boundary                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable read/write iteration           | `rain/moveRain`                                                         | Persistent rain reads velocity and writes position. Particle identities and composition stay fixed.                                                         |
| Dynamic composition and fragmentation | `status/applyStatusEffects`, `expireStatusEffects`                      | Hits add data-bearing Burning and Slowed traits to substantial enemy entities. Expiry removes them. Refreshes only update existing data.                    |
| Graph traversal and matrix math       | `transform/composeLocalMatrices`, `propagateWorldTransforms`            | Eight-node tower hierarchies articulate and propagate world matrices through parent/child relations. Muzzle matrices determine shot position and direction. |
| Graph modification                    | `targeting/updateTargetRelations`                                       | Add/remove tower-to-enemy Targeting relations. Candidate selection and distance checks run separately.                                                      |
| Query terms                           | `targeting/findTargetCandidates`                                        | Required, Not, Or, and mixed queries determine cannon priorities. Spatial indexing runs separately.                                                         |
| Bulk mutation on stable data          | `weather/applyWind`                                                     | Every tick applies one uniform wind delta to existing rain velocity using `getPages()`. Separate from particle movement, with no structural changes.        |
| Batch structural changes              | `wave/spawnEnemyGroups`, `projectile/destroyDeadEnemies`, `spawnDebris` | Waves spawn groups, explosions produce casualty groups, and casualties create debris. Collision, damage, and victim collection run separately.              |

Enemy state includes health, armor and elemental resistances, movement, route progress, bounty, appearance, transforms, matrices, and optional shields. Matrix traits hold references to 16-number arrays rather than inline scalar columns, which matters when comparing payload movement across storage implementations.

Transforms use [pmndrs math](https://github.com/pmndrs/math), published as `math` and pinned to a canary version. Local matrices compose YXZ rotations, and world matrices multiply through every ECS child relation each tick. The renderer writes these arrays directly into instance buffers. Three's automatic local/world matrix updates are disabled for the scene, objects, and cameras. A small renderer adapter uses pmndrs math to update changed scenery, camera transforms, and camera inverses, including explicit updates from controls and shadows. Three retains its internal rendering, projection, and picking calculations. Rain vectors, angle differences, wrapping, clamping, and seeded randomness also use pmndrs math.

## Setups and scaling

Choose 1×, 4×, 16×, or 64× in the devtool. Tower counts below describe autoplay's opening defense. Manual mode lets you choose your own placement.

| Setup               | At 1×                                                         | Scaling            |
| ------------------- | ------------------------------------------------------------- | ------------------ |
| Balanced battle     | 8 lanes, 96 towers, 2,048 enemies per wave                    | Multiply lanes     |
| Rainfall            | 8,192 persistent particles, one battle lane                   | Multiply particles |
| Status gauntlet     | 16 lanes, 192 towers, 8,192 enemies per wave                  | Multiply lanes     |
| Articulated battery | 32 lanes, 512 towers, 4,096 tower transform nodes             | Multiply lanes     |
| Target turnover     | 32 lanes, 512 short-range towers, 8,192 fast enemies per wave | Multiply lanes     |
| Target filtering    | 16 lanes, 16,384 enemies per wave                             | Multiply lanes     |
| Wind storm          | 8,192 particles, stronger and faster wind                     | Multiply particles |
| Swarm explosions    | 16 lanes, 8,192 enemies released together                     | Multiply lanes     |

Combat setups keep 1,024 raindrops in a shared weather field displayed over the selected lane. Drops fall continuously and recycle their positions at the bounds without spawning or destroying entities. Streak length and angle come from each drop’s velocity. Wind follows a smooth figure-eight pattern with smaller overlapping waves. The pattern is calculated once per tick, outside the bulk timing, then `applyWind` adds the change from the previously applied wind to every drop. This keeps velocities bounded and the bulk workload active on every tick. Wind storm increases the pattern’s strength and speed. Only Rainfall and Wind storm scale the particle population. Drawing is limited to 4,096 streaks to keep the battlefield readable, while movement and wind systems process every drop. Enemy groups enter in eight columns along the widened road.

Enemy counts describe wave inputs, not a fixed live population. Status coverage can use frost alone or overlapping fire and frost. Query modes return different matches in a mixed wave, so they can also change gameplay. Presets emphasize workloads while retaining the complete game.

## Domain layout

```text
src/
  rain/          Persistent raindrops and movement
  enemy/         Enemy composition, routes, shields, and spawning
  game/          Economy, autoplay, clock, victory, and defeat
  metrics/       Optional devtool timings
  projectile/    Shots, collision, damage, casualties, and debris
  setup/         Setups, lane geometry, and seeded randomness
  status/        Effect application, ticking, and expiration
  targeting/     Query terms, spatial selection, and target relations
  tower/         Building, upgrades, articulated aiming, and firing
  transform/     Parent/child relations and local/world matrices
  view/          Game UI, devtool, and Three.js rendering
  wave/          Wave scheduling
  weather/       Flowing wind and bulk velocity mutation
  world.ts       Creates the game world
  schedule.ts    Explicit system order
```

Each domain owns `traits.ts`, `actions.ts`, and `systems.ts` as needed. Game systems contain no React or browser access. The renderer consumes ECS matrices, and the fixed-step simulation lives in `schedule.ts`.

```sh
pnpm --filter @examples/tower-defense typecheck
pnpm --filter @examples/tower-defense build
```
