<script lang="ts">
  import type { World } from "@koota/core";
  import { untrack } from "svelte";
  import { useActions } from "../../src";

  let {
    actions,
    onActions,
  }: {
    actions: (world: World) => Record<string, (...args: any[]) => any>;
    onActions?: (actions: Record<string, (...args: any[]) => any>) => void;
    onWorld?: (world: World) => void;
  } = $props();

  const boundActions = useActions(untrack(() => actions));

  untrack(() => onActions?.(boundActions));
</script>
