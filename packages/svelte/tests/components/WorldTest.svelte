<script lang="ts">
  import type { World } from "@koota/core";
  import { untrack } from "svelte";
  import { provideWorld } from "../../src";
  import WorldConsumer from "./WorldConsumer.svelte";

  let {
    world,
    onWorld,
  }: {
    world: World;
    onWorld?: (world: World) => void;
  } = $props();

  untrack(() => provideWorld(world));
</script>

<WorldConsumer {onWorld} />
