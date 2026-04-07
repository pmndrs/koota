<script lang="ts">
  import type { World } from "@koota/core";
  import { untrack } from "svelte";
  import { provideWorld } from "../../src";

  let {
    onWorld,
  }: {
    onWorld?: (world: World) => void;
  } = $props();

  const world = provideWorld();

  untrack(() => onWorld?.(world));
</script>
