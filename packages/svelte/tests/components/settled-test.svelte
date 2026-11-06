<script lang="ts">
  import { untrack } from 'svelte';
  import type { Entity, Relation, Trait } from '@koota/core';
  import {
    useHas,
    useQuery,
    useQueryFirst,
    useTarget,
    useTargets,
    useTrait,
    useTraitEffect,
  } from '../../src';

  let {
    source,
    valueTrait,
    relation,
    childOf,
    onValue,
    expose,
  }: {
    source: Entity;
    valueTrait: Trait;
    relation: Relation<Trait>;
    childOf: Relation<Trait>;
    onValue: (value: unknown) => void;
    expose: (read: () => unknown) => void;
  } = $props();

  const has = useHas(
    () => source,
    () => relation('*')
  );
  const target = useTarget(
    () => source,
    () => relation
  );
  const targets = useTargets(
    () => source,
    () => relation
  );
  const value = useTrait(
    () => source,
    () => valueTrait
  );
  const query = useQuery(() => [childOf('*')]);
  const first = useQueryFirst(() => [childOf('*')]);
  useTraitEffect(
    () => source,
    () => valueTrait,
    (value) => onValue(value)
  );
  untrack(() =>
    expose(() => ({
      has: has.current,
      target: target.current,
      targets: targets.current,
      value: value.current,
      query: query.current,
      first: first.current,
    }))
  );
</script>
