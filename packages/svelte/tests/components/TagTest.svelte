<script lang="ts">
  import type { Entity, TagTrait, World } from "@koota/core";
  import { useTag } from "../../src";

  let {
    target,
    tag,
  }: {
    target: Entity | World | undefined | null;
    tag: TagTrait;
  } = $props();

  const result = useTag(
    () => target,
    () => tag,
  );
</script>

<span data-testid="value">{result.current}</span>
