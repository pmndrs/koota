# Tower-defense example

The [tower-defense example](../../../examples/tower-defense/readme.md) is a playable 3D game with seven inspectable ECS workloads and a minimal, minimizable devtool.

It follows the user's domain layout modeled on `Dev/minecraft-like`: each domain owns `traits.ts`, `actions.ts`, and `systems.ts` as needed. Keep React and browser access in `src/view/` and the browser entry point.

## Entry points

- `examples/tower-defense/src/world.ts`: creates worlds with seeded setups.
- `examples/tower-defense/src/schedule.ts`: explicit fixed-step system order.
- `examples/tower-defense/src/setup/setups.ts`: eight setups and four scale levels.
- `examples/tower-defense/src/view/app.tsx`: minimal game controls and collapsible devtool.
- `examples/tower-defense/src/view/matrices.ts`: manual Three scene/camera matrix synchronization using pmndrs math.

## Preserve the seven workloads

1. `rain/moveRain`: read velocity and write position on persistent, homogeneous particles.
2. `status/applyStatusEffects` and `expireStatusEffects`: add/remove data-bearing effects on substantial enemy entities. Refreshes are data mutations.
3. `transform/composeLocalMatrices` and `propagateWorldTransforms`: matrix math and traversal of ECS attachment relations. Muzzle matrices drive actual shots.
4. `targeting/updateTargetRelations`: update tower-to-enemy edges. Keep selection separate.
5. `targeting/findTargetCandidates`: query terms whose results feed targeting. Keep spatial work separate.
6. `weather/applyWind`: uniform page-based mutation of existing rain velocity on every tick, without structural changes. `updateWind` computes a smooth figure-eight pattern with overlapping waves outside this timing. Apply the difference from the previous wind vector to keep velocities bounded, and keep particle movement separate.
7. Wave spawning, casualty destruction, and debris spawning: separate batch structural operations.

Each remains a useful game system. Projectiles have a natural lifecycle. Status transitions come from hits and expiration, target changes from combat, and destruction from casualties. Preserve manual play, economy, waves, victory, and defeat.

Use pmndrs math (the pinned `math` package) for simulation matrices and renderer instance transforms. Matrix traits reference 16-number arrays, not inline scalar columns. Preserve YXZ rotation order and traverse every ECS hierarchy each tick. Three's automatic local/world updates stay disabled on the scene, objects, and cameras. The renderer adapter updates changed scenery and camera matrices with pmndrs, including explicit camera updates from controls and shadows. Three still owns its internal rendering, projection, and picking calculations. Keep this renderer work separate from the measured ECS transform workload.

Keep the game UI minimal, with no visible title or persistent instructions. Use icons, numbers, short labels, and hover descriptions. Keep setup/scale/seed, autoplay, single-step, and lightweight timings in the minimizable devtool. Timings are disabled when closed. Do not introduce a benchmark harness, command-line profiler, or report exports. All lanes are simulated, while the renderer displays one selectable lane. Start in autoplay to exercise the complete game immediately. The 1× balanced setup has 96 towers and 2,048 enemies per wave. Combat setups keep 1,024 ambient particles, while the two particle setups start at 8,192 and scale that population. Render rain as visible, wind-directed streaks over the selected lane, with a shared local weather field so offscreen lanes do not dilute its density. Recycle drop positions without structural changes. Cap drawing at 4,096 drops while all drops remain simulated, and yield between expensive simulation ticks so the devtool remains usable.

## Validation

Run the root typecheck, the example's typecheck/build, and format/lint only changed files per `AGENTS.md`. Check manual building, upgrades, waves, autoplay setups, and minimizing the devtool in the browser. Keep this reference and the example's readme synchronized.
