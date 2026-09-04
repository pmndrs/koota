<script lang="ts">
  import type { World } from "@koota/core";
  import { untrack } from "svelte";
  import { useWorld } from "../../src";

  let { onWorld }: { onWorld?: (world: World) => void } = $props();

  const world = useWorld();
  untrack(() => onWorld?.(world));
</script>
