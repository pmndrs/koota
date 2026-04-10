"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react.ts
var react_exports = {};
__export(react_exports, {
  WorldProvider: () => WorldProvider,
  useActions: () => useActions,
  useHas: () => useHas,
  useQuery: () => useQuery,
  useQueryFirst: () => useQueryFirst,
  useTag: () => useTag,
  useTarget: () => useTarget,
  useTargets: () => useTargets,
  useTrait: () => useTrait,
  useTraitEffect: () => useTraitEffect,
  useWorld: () => useWorld
});
module.exports = __toCommonJS(react_exports);

// ../react/src/world/use-world.ts
var import_react2 = require("react");

// ../react/src/world/world-context.ts
var import_react = require("react");
var WorldContext = (0, import_react.createContext)(null);

// ../react/src/world/use-world.ts
function useWorld() {
  const world = (0, import_react2.useContext)(WorldContext);
  if (!world) {
    throw new Error("Koota: useWorld must be used within a WorldProvider");
  }
  return world;
}

// ../react/src/hooks/use-actions.ts
function useActions(actions) {
  const world = useWorld();
  return actions(world);
}

// ../core/src/common.ts
var $internal = Symbol.for("koota.internal");

// ../core/src/entity/utils/pack-entity.ts
var ENTITY_ID_BITS = 24;
var GENERATION_BITS = 8;
var ENTITY_ID_MASK = (1 << ENTITY_ID_BITS) - 1;
var GENERATION_MASK = (1 << GENERATION_BITS) - 1;
var GENERATION_SHIFT = ENTITY_ID_BITS;
var PAGE_BITS = 10;
var PAGE_SIZE = 1 << PAGE_BITS;
var PAGE_MASK = PAGE_SIZE - 1;
var MAX_PAGES = 1 << ENTITY_ID_BITS - PAGE_BITS;
function packEntity(generation, entityId) {
  return (generation & GENERATION_MASK) << GENERATION_SHIFT | entityId & ENTITY_ID_MASK;
}

// ../core/src/utils/shallow-equal.ts
function shallowEqual(obj1, obj2) {
  return obj1 === obj2 || typeof obj1 === "object" && obj1 !== null && typeof obj2 === "object" && obj2 !== null && (() => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    return keys1.length === keys2.length && keys1.every((key) => Object.hasOwn(obj2, key) && obj1[key] === obj2[key]);
  })();
}

// ../core/src/relation/symbols.ts
var $relationPair = Symbol.for("relationPair");
var $relation = Symbol.for("relation");
var $orderedTargetsTrait = Symbol.for("orderedTargetsTrait");

// ../core/src/entity/utils/page-allocator.ts
function createPageAllocator(onWorldFinalize) {
  const allocator = {
    generations: new Array(MAX_PAGES).fill(null),
    pageAliveCounts: new Array(MAX_PAGES).fill(0),
    freePages: [],
    pageCursor: 0,
    pageOwners: new Array(MAX_PAGES).fill(null),
    worldFinalizer: null
  };
  allocator.worldFinalizer = new FinalizationRegistry((token) => {
    if (!token.registered) return;
    for (const pageId of token.ownedPages) {
      allocator.pageAliveCounts[pageId] = 0;
      allocator.pageOwners[pageId] = null;
      allocator.freePages.push(pageId);
    }
    token.ownedPages.length = 0;
    if (token.worldId !== void 0) onWorldFinalize?.(token.worldId);
  });
  return allocator;
}

// ../core/src/universe/universe.ts
function createInitialState() {
  const allocator = createPageAllocator((worldId) => {
    delete universe.worlds[worldId];
  });
  return {
    worlds: [],
    pageOwners: allocator.pageOwners,
    cachedQueries: /* @__PURE__ */ new Map(),
    pageAllocator: allocator
  };
}
var universe = {
  ...createInitialState(),
  reset: () => {
    const fresh = createInitialState();
    universe.worlds = fresh.worlds;
    universe.pageOwners = fresh.pageOwners;
    universe.cachedQueries = fresh.cachedQueries;
    universe.pageAllocator = fresh.pageAllocator;
  }
};

// ../core/src/query/modifier.ts
var $modifier = Symbol("modifier");
function isTrackingModifier(modifier) {
  const {
    type
  } = modifier;
  return type.includes("added") || type.includes("removed") || type.includes("changed");
}
function getTrackingType(modifier) {
  const {
    type
  } = modifier;
  if (type.includes("added")) return "add";
  if (type.includes("removed")) return "remove";
  if (type.includes("changed")) return "change";
  return null;
}
function isOrWithModifiers(modifier) {
  return modifier.type === "or" && Array.isArray(modifier.modifiers);
}

// ../core/src/entity/utils/paged-mask.ts
var EMPTY_MASK_PAGE = new Uint32Array(PAGE_SIZE);
function createEmptyMaskGeneration() {
  const gen = new Array(MAX_PAGES);
  gen.fill(EMPTY_MASK_PAGE);
  return gen;
}
function ensureMaskPage(gen, pageId) {
  let page = gen[pageId];
  if (page === EMPTY_MASK_PAGE) {
    page = new Uint32Array(PAGE_SIZE);
    gen[pageId] = page;
  }
  return page;
}

// ../core/src/query/symbols.ts
var $parameters = Symbol.for("parameters");
var $queryRef = Symbol.for("queryRef");

// ../core/src/query/utils/check-query.ts
function checkQuery(ctx, query, entity) {
  const staticBitmasks = query.staticBitmasks;
  const generations = query.generations;
  const eid = entity & ENTITY_ID_MASK;
  if (query.traitInstances.all.length === 0) return false;
  for (let i = 0; i < generations.length; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;
    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const entityMask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];
    if (!forbidden && !required && !or) return false;
    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  return true;
}

// ../core/src/query/utils/check-query-with-relations.ts
function checkQueryWithRelations(ctx, query, entity) {
  if (!checkQuery(ctx, query, entity)) return false;
  if (query.relationFilters && query.relationFilters.length > 0) {
    for (const pair of query.relationFilters) {
      if (pair.targetQueryMatches) {
        if (!hasRelationTargetInSet(ctx, pair.relation, entity, pair.targetQueryMatches)) {
          return false;
        }
        continue;
      }
      if (!hasRelationPair(ctx, entity, pair)) {
        return false;
      }
    }
  }
  return true;
}

// ../core/src/relation/relation.ts
function ensureRelPage(arr, pageId) {
  if (!arr[pageId]) arr[pageId] = [];
  return arr[pageId];
}
var EMPTY_ENTITY_ARRAY = Object.freeze([]);
function addToRelationSources(traitData, entity, target) {
  const buckets = traitData.relationSourcesByTarget ??= [];
  const bucket = buckets[target & ENTITY_ID_MASK] ??= [];
  bucket.push(entity);
}
function removeFromRelationSources(traitData, entity, target) {
  const bucket = traitData.relationSourcesByTarget?.[target & ENTITY_ID_MASK];
  if (!bucket) return;
  const idx = bucket.indexOf(entity);
  if (idx === -1) return;
  const last = bucket.length - 1;
  if (idx !== last) bucket[idx] = bucket[last];
  bucket.pop();
}
function addRelationTarget(ctx, relation2, entity, target) {
  const relationCtx = relation2[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return -1;
  if (!traitData.relationTargets) {
    traitData.relationTargets = [];
  }
  const eid = entity & ENTITY_ID_MASK;
  const p = eid >>> 10, o = eid & 1023;
  const page = ensureRelPage(traitData.relationTargets, p);
  let targetIndex;
  if (relationCtx.exclusive) {
    if (page[o] === target) return -1;
    page[o] = target;
    targetIndex = 0;
  } else {
    if (!page[o]) page[o] = [];
    const entityTargets = page[o];
    const existingIndex = entityTargets.indexOf(target);
    if (existingIndex !== -1) return -1;
    targetIndex = entityTargets.length;
    entityTargets.push(target);
  }
  updateQueriesForRelationChange(ctx, relation2, entity);
  addToRelationSources(traitData, entity, target);
  return targetIndex;
}
function removeRelationTarget(ctx, relation2, entity, target) {
  const relationCtx = relation2[$internal];
  const relationTrait = relationCtx.trait;
  const data = ctx.traitInstances[relationTrait.id];
  if (!data || !data.relationTargets) return {
    removedIndex: -1,
    wasLastTarget: false
  };
  const eid = entity & ENTITY_ID_MASK;
  const p = eid >>> 10, o = eid & 1023;
  const page = data.relationTargets[p];
  if (!page) return {
    removedIndex: -1,
    wasLastTarget: false
  };
  let removedIndex = -1;
  let hasRemainingTargets = false;
  if (relationCtx.exclusive) {
    if (page[o] === target) {
      removeFromRelationSources(data, entity, target);
      page[o] = void 0;
      removedIndex = 0;
      hasRemainingTargets = false;
      clearRelationDataInternal(data.store, relationTrait[$internal].type, eid, 0, true);
    }
  } else {
    const entityTargets = page[o];
    if (entityTargets) {
      const idx = entityTargets.indexOf(target);
      if (idx !== -1) {
        const lastIdx = entityTargets.length - 1;
        removeFromRelationSources(data, entity, target);
        if (idx !== lastIdx) entityTargets[idx] = entityTargets[lastIdx];
        entityTargets.pop();
        swapAndPopRelationData(data.store, relationTrait[$internal].type, eid, idx, lastIdx);
        removedIndex = idx;
        hasRemainingTargets = entityTargets.length > 0;
      }
    }
  }
  if (removedIndex !== -1) updateQueriesForRelationChange(ctx, relation2, entity);
  const wasLastTarget = removedIndex !== -1 && !hasRemainingTargets;
  return {
    removedIndex,
    wasLastTarget
  };
}
function updateQueriesForRelationChange(ctx, relation2, entity) {
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return;
  for (const query of traitData.relationQueries) {
    const match = checkQueryWithRelations(ctx, query, entity);
    if (match) {
      query.add(entity);
    } else {
      query.remove(ctx, entity);
    }
  }
}
function swapAndPopRelationData(store, type, eid, idx, lastIdx) {
  const p = eid >>> 10, o = eid & 1023;
  if (type === "aos") {
    const arr = store[p]?.[o];
    if (arr) {
      if (idx !== lastIdx) arr[idx] = arr[lastIdx];
      arr.pop();
    }
  } else {
    for (const key in store) {
      const arr = store[key][p]?.[o];
      if (arr) {
        if (idx !== lastIdx) arr[idx] = arr[lastIdx];
        arr.pop();
      }
    }
  }
}
function clearRelationDataInternal(store, type, eid, _idx, exclusive) {
  if (!exclusive) return;
  const p = eid >>> 10, o = eid & 1023;
  if (type === "aos") {
    if (store[p]) store[p][o] = void 0;
  } else {
    for (const key in store) {
      if (store[key][p]) store[key][p][o] = void 0;
    }
  }
}
function removeAllRelationTargets(ctx, relation2, entity) {
  let result_getRelationTargets_16_$f;
  const relationCtx_16_$f = relation2[$internal];
  const traitData_16_$f = ctx.traitInstances[relationCtx_16_$f.trait.id];
  if (!traitData_16_$f || !traitData_16_$f.relationTargets) {
    result_getRelationTargets_16_$f = [];
  } else {
    const eid_16_$f = entity & ENTITY_ID_MASK;
    const p_16_$f = eid_16_$f >>> 10, o_16_$f = eid_16_$f & 1023;
    const page_16_$f = traitData_16_$f.relationTargets[p_16_$f];
    if (!page_16_$f) {
      result_getRelationTargets_16_$f = [];
    } else {
      if (relationCtx_16_$f.exclusive) {
        const target_16_$f = page_16_$f[o_16_$f];
        result_getRelationTargets_16_$f = target_16_$f !== void 0 ? [target_16_$f] : [];
      } else {
        const targets_16_$f = page_16_$f[o_16_$f];
        result_getRelationTargets_16_$f = targets_16_$f !== void 0 ? targets_16_$f.slice() : [];
      }
    }
  }
  const targets = result_getRelationTargets_16_$f;
  for (const target of targets) {
    removeRelationTarget(ctx, relation2, entity, target);
  }
}
function getEntitiesWithRelationTo(ctx, relation2, target) {
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData?.relationSourcesByTarget) return EMPTY_ENTITY_ARRAY;
  return traitData.relationSourcesByTarget[target & ENTITY_ID_MASK]?.slice() ?? EMPTY_ENTITY_ARRAY;
}
function hasRelationTargetInSet(ctx, relation2, entity, matches) {
  const relationCtx = relation2[$internal];
  const traitData = ctx.traitInstances[relationCtx.trait.id];
  if (!traitData?.relationTargets) return false;
  const eid = entity & ENTITY_ID_MASK;
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return false;
  if (relationCtx.exclusive) {
    const target = page[eid & 1023];
    return target !== void 0 && matches.has(target);
  }
  const targets = page[eid & 1023];
  if (!targets) return false;
  for (let i = 0; i < targets.length; i++) {
    if (matches.has(targets[i])) return true;
  }
  return false;
}
function setRelationDataAtIndex(ctx, entity, relation2, targetIndex, value) {
  const relationCtx = relation2[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return;
  const store = traitData.store;
  const eid = entity & ENTITY_ID_MASK;
  const p = eid >>> 10, o = eid & 1023;
  if (baseTrait[$internal].type === "aos") {
    const page = ensureRelPage(store, p);
    if (relationCtx.exclusive) {
      page[o] = value;
    } else {
      (page[o] ??= [])[targetIndex] = value;
    }
    return;
  }
  const storeRec = store;
  if (relationCtx.exclusive) {
    for (const key in value) {
      ensureRelPage(storeRec[key], p)[o] = value[key];
    }
  } else {
    for (const key in value) {
      const kPage = ensureRelPage(storeRec[key], p);
      (kPage[o] ??= [])[targetIndex] = value[key];
    }
  }
}
function setRelationData(ctx, entity, relation2, target, value) {
  let result_getTargetIndex_23_$f;
  const relationCtx_23_$f = relation2[$internal];
  const baseTrait_23_$f = relationCtx_23_$f.trait;
  const traitData_23_$f = ctx.traitInstances[baseTrait_23_$f.id];
  if (!traitData_23_$f || !traitData_23_$f.relationTargets) {
    result_getTargetIndex_23_$f = -1;
  } else {
    const eid_23_$f = entity & ENTITY_ID_MASK;
    const page_23_$f = traitData_23_$f.relationTargets[eid_23_$f >>> 10];
    if (!page_23_$f) {
      result_getTargetIndex_23_$f = -1;
    } else {
      if (relationCtx_23_$f.exclusive) {
        result_getTargetIndex_23_$f = page_23_$f[eid_23_$f & 1023] === target ? 0 : -1;
      } else {
        const targets_23_$f = page_23_$f[eid_23_$f & 1023];
        result_getTargetIndex_23_$f = targets_23_$f ? targets_23_$f.indexOf(target) : -1;
      }
    }
  }
  const targetIndex = result_getTargetIndex_23_$f;
  if (targetIndex === -1) return;
  setRelationDataAtIndex(ctx, entity, relation2, targetIndex, value);
}
function getRelationData(ctx, entity, relation2, target) {
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return void 0;
  let result_getTargetIndex_25_$f;
  const relationCtx_25_$f = relation2[$internal];
  const baseTrait_25_$f = relationCtx_25_$f.trait;
  const traitData_25_$f = ctx.traitInstances[baseTrait_25_$f.id];
  if (!traitData_25_$f || !traitData_25_$f.relationTargets) {
    result_getTargetIndex_25_$f = -1;
  } else {
    const eid_25_$f = entity & ENTITY_ID_MASK;
    const page_25_$f = traitData_25_$f.relationTargets[eid_25_$f >>> 10];
    if (!page_25_$f) {
      result_getTargetIndex_25_$f = -1;
    } else {
      if (relationCtx_25_$f.exclusive) {
        result_getTargetIndex_25_$f = page_25_$f[eid_25_$f & 1023] === target ? 0 : -1;
      } else {
        const targets_25_$f = page_25_$f[eid_25_$f & 1023];
        result_getTargetIndex_25_$f = targets_25_$f ? targets_25_$f.indexOf(target) : -1;
      }
    }
  }
  const targetIndex = result_getTargetIndex_25_$f;
  if (targetIndex === -1) return void 0;
  const traitCtx = baseTrait[$internal];
  const store = traitData.store;
  const eid = entity & ENTITY_ID_MASK;
  const p = eid >>> 10, o = eid & 1023;
  const relationCtx = relation2[$internal];
  if (traitCtx.type === "aos") {
    const page = store[p];
    if (!page) return void 0;
    if (relationCtx.exclusive) {
      return page[o];
    } else {
      return page[o]?.[targetIndex];
    }
  } else {
    const result = {};
    const storeRecord = store;
    for (const key in store) {
      const kPage = storeRecord[key][p];
      if (!kPage) continue;
      if (relationCtx.exclusive) {
        result[key] = kPage[o];
      } else {
        result[key] = kPage[o]?.[targetIndex];
      }
    }
    return result;
  }
}
function hasRelationPair(ctx, entity, pair) {
  const relation2 = pair.relation;
  const target = pair.target;
  if (!hasTrait(ctx, entity, relation2[$internal].trait)) return false;
  if (target === "*") return true;
  if (typeof target === "number") {
    let result_hasRelationToTarget_27_$f;
    const relationCtx_27_$f = relation2[$internal];
    const baseTrait_27_$f = relationCtx_27_$f.trait;
    const traitData_27_$f = ctx.traitInstances[baseTrait_27_$f.id];
    if (!traitData_27_$f || !traitData_27_$f.relationTargets) {
      result_hasRelationToTarget_27_$f = false;
    } else {
      const eid_27_$f = entity & ENTITY_ID_MASK;
      const page_27_$f = traitData_27_$f.relationTargets[eid_27_$f >>> 10];
      if (!page_27_$f) {
        result_hasRelationToTarget_27_$f = false;
      } else {
        if (relationCtx_27_$f.exclusive) {
          result_hasRelationToTarget_27_$f = page_27_$f[eid_27_$f & 1023] === target;
        } else {
          const targets_27_$f = page_27_$f[eid_27_$f & 1023];
          result_hasRelationToTarget_27_$f = targets_27_$f ? targets_27_$f.includes(target) : false;
        }
      }
    }
    return result_hasRelationToTarget_27_$f;
  }
  return false;
}

// ../core/src/query/utils/check-query-tracking.ts
function checkQueryTracking(ctx, query, entity, eventType, eventGenerationId, eventBitflag) {
  const staticBitmasks = query.staticBitmasks;
  const trackingGroups = query.trackingGroups;
  const generations = query.generations;
  const traitInstancesAll = query.traitInstances.all;
  const entityMasks = ctx.entityMasks;
  const eid = entity & ENTITY_ID_MASK;
  const generationsLen = generations.length;
  const trackingGroupsLen = trackingGroups.length;
  if (traitInstancesAll.length === 0) return false;
  for (let i = 0; i < generationsLen; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;
    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const entityMask = entityMasks[generationId][eid >>> 10][eid & 1023];
    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  let hasOrGroup = false;
  let anyOrMatched = false;
  for (let i = 0; i < trackingGroupsLen; i++) {
    const group = trackingGroups[i];
    const groupType = group.type;
    const groupLogic = group.logic;
    const groupBitmasks = group.bitmasks;
    const groupBitmask = groupBitmasks[eventGenerationId];
    if (groupBitmask && groupBitmask & eventBitflag) {
      if (eventType === "remove") {
        if (groupType === "add" || groupType === "change") return false;
      } else if (eventType === "add") {
        if (groupType === "remove" || groupType === "change") return false;
      }
      if (groupType === eventType) {
        if (eventType === "change") {
          const entityMask = entityMasks[eventGenerationId][eid >>> 10][eid & 1023];
          if (!(entityMask & eventBitflag)) return false;
        }
        const groupTrackers = group.trackers;
        if (!groupTrackers[eventGenerationId]) {
          groupTrackers[eventGenerationId] = createEmptyMaskGeneration();
        }
        ensureMaskPage(groupTrackers[eventGenerationId], eid >>> 10)[eid & 1023] |= eventBitflag;
      }
    }
    if (groupLogic === "or") {
      hasOrGroup = true;
      if (!anyOrMatched) {
        const groupTrackers = group.trackers;
        const bitmaskLen = groupBitmasks.length;
        for (let genId = 0; genId < bitmaskLen; genId++) {
          const mask = groupBitmasks[genId];
          if (!mask) continue;
          const trackerGen = groupTrackers[genId];
          const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
          if (tracker & mask) {
            anyOrMatched = true;
            break;
          }
        }
      }
    } else {
      const groupTrackers = group.trackers;
      const bitmaskLen = groupBitmasks.length;
      for (let genId = 0; genId < bitmaskLen; genId++) {
        const mask = groupBitmasks[genId];
        if (!mask) continue;
        const trackerGen = groupTrackers[genId];
        const tracker = trackerGen ? trackerGen[eid >>> 10][eid & 1023] : 0;
        if ((tracker & mask) !== mask) {
          return false;
        }
      }
    }
  }
  if (hasOrGroup && !anyOrMatched) {
    return false;
  }
  return true;
}

// ../core/src/query/utils/check-query-tracking-with-relations.ts
function checkQueryTrackingWithRelations(ctx, query, entity, eventType, eventGenerationId, eventBitflag) {
  if (!checkQueryTracking(ctx, query, entity, eventType, eventGenerationId, eventBitflag)) {
    return false;
  }
  if (query.relationFilters && query.relationFilters.length > 0) {
    for (const pair of query.relationFilters) {
      if (pair.targetQueryMatches) {
        if (!hasRelationTargetInSet(ctx, pair.relation, entity, pair.targetQueryMatches)) {
          return false;
        }
        continue;
      }
      if (!hasRelationPair(ctx, entity, pair)) {
        return false;
      }
    }
  }
  return true;
}

// ../core/src/relation/ordered.ts
function setupOrderedTraitSync(ctx, orderedTrait) {
  const relation2 = orderedTrait[$orderedTargetsTrait].relation;
  const relationTrait = relation2[$internal].trait;
  const orderedInstance = ctx.traitInstances[orderedTrait.id];
  if (!orderedInstance) return;
  let relationInstance = ctx.traitInstances[relationTrait.id];
  if (!relationInstance) {
    registerTrait(ctx, relationTrait);
    relationInstance = ctx.traitInstances[relationTrait.id];
  }
  const {
    generationId,
    bitflag,
    store
  } = orderedInstance;
  const {
    entityMasks,
    entityIndex
  } = ctx;
  const traitCtx = orderedTrait[$internal];
  const getList = (parent) => {
    const eid = parent & ENTITY_ID_MASK;
    return entityMasks[generationId][eid >>> 10][eid & 1023] & bitflag ? traitCtx.get(eid, store) : void 0;
  };
  relationInstance.addSubscriptions.add((child, parent) => {
    getList(parent)?._appendWithoutSync(child);
  });
  relationInstance.removeSubscriptions.add((child, parent) => {
    const eid = parent & ENTITY_ID_MASK;
    const denseIdx = entityIndex.sparse[eid];
    if (denseIdx !== void 0 && (entityIndex.dense[denseIdx] & ENTITY_ID_MASK) === eid) {
      getList(parent)?._removeWithoutSync(child);
    }
  });
}

// ../core/src/relation/ordered-list.ts
var OrderedList = class extends Array {
  ctx;
  parent;
  relation;
  orderedTrait;
  _syncing = false;
  constructor(ctx, parent, relation2, orderedTrait, items = []) {
    super(...items);
    this.ctx = ctx;
    this.parent = parent;
    this.relation = relation2;
    this.orderedTrait = orderedTrait;
  }
  get [Symbol.toStringTag]() {
    return "OrderedList";
  }
  /**
   * Add entities to the end of the list and add relation pairs.
   */
  push(...items) {
    this._syncing = true;
    try {
      for (const item of items) {
        addTrait(this.ctx, item, this.relation(this.parent));
      }
      const result = super.push(...items);
      setChanged(this.ctx, this.parent, this.orderedTrait);
      return result;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and return the last entity, removing its relation pair.
   */
  pop() {
    this._syncing = true;
    try {
      const item = super.pop();
      if (item !== void 0) {
        removeTrait(this.ctx, item, this.relation(this.parent));
        setChanged(this.ctx, this.parent, this.orderedTrait);
      }
      return item;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and return the first entity, removing its relation pair.
   */
  shift() {
    this._syncing = true;
    try {
      const item = super.shift();
      if (item !== void 0) {
        removeTrait(this.ctx, item, this.relation(this.parent));
        setChanged(this.ctx, this.parent, this.orderedTrait);
      }
      return item;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Add entities to the beginning of the list and add relation pairs.
   */
  unshift(...items) {
    this._syncing = true;
    try {
      for (const item of items) {
        addTrait(this.ctx, item, this.relation(this.parent));
      }
      const result = super.unshift(...items);
      setChanged(this.ctx, this.parent, this.orderedTrait);
      return result;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and/or insert entities, syncing relation pairs.
   */
  splice(start, deleteCount, ...items) {
    this._syncing = true;
    try {
      const removed = super.splice(start, deleteCount ?? 0, ...items);
      for (const item of removed) {
        removeTrait(this.ctx, item, this.relation(this.parent));
      }
      for (const item of items) {
        addTrait(this.ctx, item, this.relation(this.parent));
      }
      if (removed.length > 0 || items.length > 0) {
        setChanged(this.ctx, this.parent, this.orderedTrait);
      }
      return removed;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Sort the list in place. Does not modify relations.
   */
  sort(compareFn) {
    super.sort(compareFn);
    setChanged(this.ctx, this.parent, this.orderedTrait);
    return this;
  }
  /**
   * Reverse the list in place. Does not modify relations.
   */
  reverse() {
    super.reverse();
    setChanged(this.ctx, this.parent, this.orderedTrait);
    return this;
  }
  /**
   * Override map to return a plain array instead of OrderedList.
   */
  map(callbackfn) {
    return Array.prototype.map.call(this, callbackfn);
  }
  /**
   * Override filter to return a plain array instead of OrderedList.
   */
  filter(predicate) {
    return Array.prototype.filter.call(this, predicate);
  }
  /**
   * Override slice to return a plain array instead of OrderedList.
   */
  slice(start, end) {
    return Array.prototype.slice.call(this, start, end);
  }
  /**
   * Move an entity to a specific index in the list.
   * Does not modify the relation, only reorders.
   */
  moveTo(item, toIndex) {
    const fromIndex = this.indexOf(item);
    if (fromIndex === -1) {
      throw new Error("Item not found in OrderedList");
    }
    if (fromIndex === toIndex) return;
    super.splice(fromIndex, 1);
    super.splice(toIndex, 0, item);
    setChanged(this.ctx, this.parent, this.orderedTrait);
  }
  /**
   * Insert an entity at a specific index and add its relation pair.
   */
  insert(item, index) {
    this._syncing = true;
    try {
      addTrait(this.ctx, item, this.relation(this.parent));
      super.splice(index, 0, item);
      setChanged(this.ctx, this.parent, this.orderedTrait);
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Internal method to append without triggering relation add.
   * Used by the sync system when a relation is added externally.
   */
  _appendWithoutSync(item) {
    if (!this._syncing) {
      super.push(item);
      setChanged(this.ctx, this.parent, this.orderedTrait);
    }
  }
  /**
   * Internal method to remove without triggering relation remove.
   * Used by the sync system when a relation is removed externally.
   */
  _removeWithoutSync(item) {
    if (!this._syncing) {
      const index = this.indexOf(item);
      if (index !== -1) {
        super.splice(index, 1);
        setChanged(this.ctx, this.parent, this.orderedTrait);
      }
    }
  }
};

// ../core/src/storage/stores.ts
function createStore(schema) {
  if (typeof schema === "function") {
    return [];
  } else {
    const store = {};
    for (const key in schema) {
      store[key] = [];
    }
    return store;
  }
}

// ../core/src/storage/accessors.ts
function createSoASetFunction(schema) {
  const keys = Object.keys(schema);
  const setFunctionBody = keys.map((key) => `if ('${key}' in value) { if (!store.${key}[p]) store.${key}[p] = []; store.${key}[p][o] = value.${key}; }`).join("\n    ");
  const set = new Function("index", "store", "value", `
        var p = index >>> 10, o = index & 1023;
        ${setFunctionBody}
        `);
  return set;
}
function createSoAFastSetFunction(schema) {
  const keys = Object.keys(schema);
  const setFunctionBody = keys.map((key) => `if (!store.${key}[p]) store.${key}[p] = []; store.${key}[p][o] = value.${key};`).join("\n    ");
  const set = new Function("index", "store", "value", `
        var p = index >>> 10, o = index & 1023;
        ${setFunctionBody}
        `);
  return set;
}
function createSoAFastSetChangeFunction(schema) {
  const keys = Object.keys(schema);
  const setFunctionBody = keys.map((key) => `if (!store.${key}[p]) store.${key}[p] = [];
        if (store.${key}[p][o] !== value.${key}) { store.${key}[p][o] = value.${key}; changed = true; }`).join("\n    ");
  const set = new Function("index", "store", "value", `
        var p = index >>> 10, o = index & 1023;
        var changed = false;
        ${setFunctionBody}
        return changed;
        `);
  return set;
}
function createSoAGetFunction(schema) {
  const keys = Object.keys(schema);
  const objectLiteral = `{ ${keys.map((key) => `${key}: store.${key}[p][o]`).join(", ")} }`;
  const get = new Function("index", "store", `
        var p = index >>> 10, o = index & 1023;
        return ${objectLiteral};
        `);
  return get;
}
function createAoSSetFunction(_schema) {
  return (index, store, value) => {
    const p = index >>> 10;
    if (!store[p]) store[p] = [];
    store[p][index & 1023] = value;
  };
}
function createAoSFastSetChangeFunction(_schema) {
  return (index, store, value) => {
    const p = index >>> 10, o = index & 1023;
    if (!store[p]) store[p] = [];
    let changed = false;
    if (value !== store[p][o]) {
      store[p][o] = value;
      changed = true;
    }
    return changed;
  };
}
function createAoSGetFunction(_schema) {
  return (index, store) => {
    const page = store[index >>> 10];
    return page ? page[index & 1023] : void 0;
  };
}
var noop = () => {
};
var createTagNoop = () => noop;
var createSetFunction = {
  soa: createSoASetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop
};
var createFastSetFunction = {
  soa: createSoAFastSetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop
};
var createFastSetChangeFunction = {
  soa: createSoAFastSetChangeFunction,
  aos: createAoSFastSetChangeFunction,
  tag: createTagNoop
};
var createGetFunction = {
  soa: createSoAGetFunction,
  aos: createAoSGetFunction,
  tag: createTagNoop
};

// ../core/src/trait/trait.ts
var tagSchema = Object.freeze({});
var traitId = 0;
function createTrait(schema = tagSchema) {
  const isAoS = typeof schema === "function";
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const traitType = isAoS ? "aos" : isTag ? "tag" : "soa";
  for (const key_0_$f in schema) {
    const value_0_$f = schema[key_0_$f];
    if (value_0_$f !== null && typeof value_0_$f === "object") {
      const kind_0_$f = Array.isArray(value_0_$f) ? "array" : "object";
      throw new Error(`Koota: ${key_0_$f} is an ${kind_0_$f}, which is not supported in traits.`);
    }
  }
  const id = traitId++;
  const Trait = Object.assign((params) => [Trait, params], {
    [$internal]: {
      id,
      set: createSetFunction[traitType](schema),
      fastSet: createFastSetFunction[traitType](schema),
      fastSetWithChangeDetection: createFastSetChangeFunction[traitType](schema),
      get: createGetFunction[traitType](schema),
      createStore: () => createStore(schema),
      relation: null,
      type: traitType
    }
  });
  Object.defineProperty(Trait, "id", {
    value: id,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(Trait, "schema", {
    value: schema,
    writable: false,
    enumerable: true,
    configurable: false
  });
  return Trait;
}
var trait = createTrait;
function registerTrait(ctx, trait2) {
  const traitCtx = trait2[$internal];
  const data = {
    generationId: ctx.entityMasks.length - 1,
    bitflag: ctx.bitflag,
    trait: trait2,
    store: traitCtx.createStore(),
    queries: /* @__PURE__ */ new Set(),
    trackingQueries: /* @__PURE__ */ new Set(),
    notQueries: /* @__PURE__ */ new Set(),
    relationQueries: /* @__PURE__ */ new Set(),
    schema: trait2.schema,
    changeSubscriptions: /* @__PURE__ */ new Set(),
    addSubscriptions: /* @__PURE__ */ new Set(),
    removeSubscriptions: /* @__PURE__ */ new Set()
  };
  const traitId_1_$f = trait2.id;
  if (traitId_1_$f >= ctx.traitInstances.length) {
    ctx.traitInstances.length = traitId_1_$f + 1;
  }
  ctx.traitInstances[traitId_1_$f] = data;
  ctx.traits.add(trait2);
  if (traitCtx.relation) ctx.relations.add(traitCtx.relation);
  ctx.bitflag *= 2;
  if (ctx.bitflag >= 2 ** 31) {
    ctx.bitflag = 1;
    ctx.entityMasks.push(createEmptyMaskGeneration());
    for (const m_2_$f of ctx.dirtyMasks.values()) m_2_$f.push(createEmptyMaskGeneration());
    for (const m_2_$f of ctx.changedMasks.values()) m_2_$f.push(createEmptyMaskGeneration());
    for (const m_2_$f of ctx.trackingSnapshots.values()) m_2_$f.push(createEmptyMaskGeneration());
  }
  if ($orderedTargetsTrait in trait2) setupOrderedTraitSync(ctx, trait2);
}
function getOrderedTrait(ctx, entity, trait2) {
  const relation2 = trait2[$orderedTargetsTrait].relation;
  return new OrderedList(ctx, entity, relation2, trait2);
}
function addTrait(ctx, entity, ...traits) {
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    if (config?.[$relationPair]) {
      let result_addRelationPair_6_$f;
      const relation_6_$f = config.relation;
      const target_6_$f = config.target;
      if (typeof target_6_$f !== "number") {
        result_addRelationPair_6_$f = void 0;
      } else {
        const params_6_$f = config.params;
        const relationCtx_6_$f = relation_6_$f[$internal];
        const relationTrait_6_$f = relationCtx_6_$f.trait;
        let result_hasRelationToTarget_7_$f;
        const relationCtx_7_$f = relation_6_$f[$internal];
        const baseTrait_7_$f = relationCtx_7_$f.trait;
        const traitData_7_$f = ctx.traitInstances[baseTrait_7_$f.id];
        if (!traitData_7_$f || !traitData_7_$f.relationTargets) {
          result_hasRelationToTarget_7_$f = false;
        } else {
          const eid_7_$f = entity & ENTITY_ID_MASK;
          const page_7_$f = traitData_7_$f.relationTargets[eid_7_$f >>> 10];
          if (!page_7_$f) {
            result_hasRelationToTarget_7_$f = false;
          } else {
            if (relationCtx_7_$f.exclusive) {
              result_hasRelationToTarget_7_$f = page_7_$f[eid_7_$f & 1023] === target_6_$f;
            } else {
              const targets_7_$f = page_7_$f[eid_7_$f & 1023];
              result_hasRelationToTarget_7_$f = targets_7_$f ? targets_7_$f.includes(target_6_$f) : false;
            }
          }
        }
        if (result_hasRelationToTarget_7_$f) {
          result_addRelationPair_6_$f = void 0;
        } else {
          if (relationCtx_6_$f.exclusive) {
            let result_getFirstRelationTarget_8_$f;
            const relationCtx_8_$f = relation_6_$f[$internal];
            const traitData_8_$f = ctx.traitInstances[relationCtx_8_$f.trait.id];
            if (!traitData_8_$f || !traitData_8_$f.relationTargets) {
              result_getFirstRelationTarget_8_$f = void 0;
            } else {
              const eid_8_$f = entity & ENTITY_ID_MASK;
              const page_8_$f = traitData_8_$f.relationTargets[eid_8_$f >>> 10];
              if (!page_8_$f) {
                result_getFirstRelationTarget_8_$f = void 0;
              } else {
                if (relationCtx_8_$f.exclusive) {
                  result_getFirstRelationTarget_8_$f = page_8_$f[eid_8_$f & 1023];
                } else {
                  result_getFirstRelationTarget_8_$f = page_8_$f[eid_8_$f & 1023]?.[0];
                }
              }
            }
            const oldTarget_6_$f = result_getFirstRelationTarget_8_$f;
            if (oldTarget_6_$f !== void 0 && oldTarget_6_$f !== target_6_$f) {
              const instance_6_$f2 = ctx.traitInstances[relationTrait_6_$f.id];
              if (instance_6_$f2) {
                for (const sub_6_$f of instance_6_$f2.removeSubscriptions) sub_6_$f(entity, oldTarget_6_$f);
              }
              removeRelationTarget(ctx, relation_6_$f, entity, oldTarget_6_$f);
            }
          }
          let result_addTraitToEntity_10_$f;
          if (hasTrait(ctx, entity, relationTrait_6_$f)) {
            result_addTraitToEntity_10_$f = void 0;
          } else {
            const traitId_14_$f = relationTrait_6_$f.id;
            if (!(traitId_14_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_14_$f] !== void 0)) {
              registerTrait(ctx, relationTrait_6_$f);
            }
            const instance_10_$f = ctx.traitInstances[relationTrait_6_$f.id];
            const {
              generationId,
              bitflag,
              queries,
              trackingQueries
            } = instance_10_$f;
            const eid_10_$f = entity & ENTITY_ID_MASK;
            const pageId_10_$f = eid_10_$f >>> 10;
            const offset_10_$f = eid_10_$f & 1023;
            ensureMaskPage(ctx.entityMasks[generationId], pageId_10_$f)[offset_10_$f] |= bitflag;
            for (const dirtyMask_10_$f of ctx.dirtyMasks.values()) {
              ensureMaskPage(dirtyMask_10_$f[generationId], pageId_10_$f)[offset_10_$f] |= bitflag;
            }
            for (const query_10_$f of queries) {
              query_10_$f.toRemove.remove(entity);
              const match_10_$f = query_10_$f.relationFilters && query_10_$f.relationFilters.length > 0 ? checkQueryWithRelations(ctx, query_10_$f, entity) : query_10_$f.check(ctx, entity);
              if (match_10_$f) {
                query_10_$f.add(entity);
              } else {
                query_10_$f.remove(ctx, entity);
              }
            }
            for (const query_10_$f of trackingQueries) {
              query_10_$f.toRemove.remove(entity);
              const match_10_$f = query_10_$f.relationFilters && query_10_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(ctx, query_10_$f, entity, "add", generationId, bitflag) : query_10_$f.checkTracking(ctx, entity, "add", generationId, bitflag);
              if (match_10_$f) {
                query_10_$f.add(entity);
              } else {
                query_10_$f.remove(ctx, entity);
              }
            }
            ctx.entityTraits.get(entity).add(relationTrait_6_$f);
            result_addTraitToEntity_10_$f = instance_10_$f;
          }
          let instance_6_$f = result_addTraitToEntity_10_$f;
          const targetIndex_6_$f = addRelationTarget(ctx, relation_6_$f, entity, target_6_$f);
          if (targetIndex_6_$f === -1) {
            result_addRelationPair_6_$f = void 0;
          } else {
            const schema_6_$f = instance_6_$f?.schema_6_$f ?? ctx.traitInstances[relationTrait_6_$f.id].schema;
            let result_getSchemaDefaults_12_$f;
            if (relationTrait_6_$f[$internal].type === "aos") {
              result_getSchemaDefaults_12_$f = typeof schema_6_$f === "function" ? schema_6_$f() : null;
            } else {
              if (!schema_6_$f || typeof schema_6_$f === "function" || Object.keys(schema_6_$f).length === 0) {
                result_getSchemaDefaults_12_$f = null;
              } else {
                const defaults_12_$f = {};
                for (const key_12_$f in schema_6_$f) {
                  if (typeof schema_6_$f[key_12_$f] === "function") {
                    defaults_12_$f[key_12_$f] = schema_6_$f[key_12_$f]();
                  } else {
                    defaults_12_$f[key_12_$f] = schema_6_$f[key_12_$f];
                  }
                }
                result_getSchemaDefaults_12_$f = defaults_12_$f;
              }
            }
            const defaults_6_$f = result_getSchemaDefaults_12_$f;
            if (defaults_6_$f) {
              setRelationDataAtIndex(ctx, entity, relation_6_$f, targetIndex_6_$f, {
                ...defaults_6_$f,
                ...params_6_$f
              });
            } else {
              if (params_6_$f) {
                setRelationDataAtIndex(ctx, entity, relation_6_$f, targetIndex_6_$f, params_6_$f);
              }
            }
            instance_6_$f = instance_6_$f ?? ctx.traitInstances[relationTrait_6_$f.id];
            for (const sub_6_$f of instance_6_$f.addSubscriptions) sub_6_$f(entity, target_6_$f);
          }
        }
      }
      result_addRelationPair_6_$f;
      continue;
    }
    let trait2;
    let params;
    if (Array.isArray(config)) {
      [trait2, params] = config;
    } else {
      trait2 = config;
    }
    let result_addTraitToEntity_17_$f;
    if (hasTrait(ctx, entity, trait2)) {
      result_addTraitToEntity_17_$f = void 0;
    } else {
      const traitId_20_$f = trait2.id;
      if (!(traitId_20_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_20_$f] !== void 0)) {
        registerTrait(ctx, trait2);
      }
      const instance_17_$f = ctx.traitInstances[trait2.id];
      const {
        generationId,
        bitflag,
        queries,
        trackingQueries
      } = instance_17_$f;
      const eid_17_$f = entity & ENTITY_ID_MASK;
      const pageId_17_$f = eid_17_$f >>> 10;
      const offset_17_$f = eid_17_$f & 1023;
      ensureMaskPage(ctx.entityMasks[generationId], pageId_17_$f)[offset_17_$f] |= bitflag;
      for (const dirtyMask_17_$f of ctx.dirtyMasks.values()) {
        ensureMaskPage(dirtyMask_17_$f[generationId], pageId_17_$f)[offset_17_$f] |= bitflag;
      }
      for (const query_17_$f of queries) {
        query_17_$f.toRemove.remove(entity);
        const match_17_$f = query_17_$f.relationFilters && query_17_$f.relationFilters.length > 0 ? checkQueryWithRelations(ctx, query_17_$f, entity) : query_17_$f.check(ctx, entity);
        if (match_17_$f) {
          query_17_$f.add(entity);
        } else {
          query_17_$f.remove(ctx, entity);
        }
      }
      for (const query_17_$f of trackingQueries) {
        query_17_$f.toRemove.remove(entity);
        const match_17_$f = query_17_$f.relationFilters && query_17_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(ctx, query_17_$f, entity, "add", generationId, bitflag) : query_17_$f.checkTracking(ctx, entity, "add", generationId, bitflag);
        if (match_17_$f) {
          query_17_$f.add(entity);
        } else {
          query_17_$f.remove(ctx, entity);
        }
      }
      ctx.entityTraits.get(entity).add(trait2);
      result_addTraitToEntity_17_$f = instance_17_$f;
    }
    const data = result_addTraitToEntity_17_$f;
    if (!data) continue;
    const traitCtx = trait2[$internal];
    let result_getSchemaDefaults_19_$f;
    if (traitCtx.type === "aos") {
      result_getSchemaDefaults_19_$f = typeof data.schema === "function" ? data.schema() : null;
    } else {
      if (!data.schema || typeof data.schema === "function" || Object.keys(data.schema).length === 0) {
        result_getSchemaDefaults_19_$f = null;
      } else {
        const defaults_19_$f = {};
        for (const key_19_$f in data.schema) {
          if (typeof data.schema[key_19_$f] === "function") {
            defaults_19_$f[key_19_$f] = data.schema[key_19_$f]();
          } else {
            defaults_19_$f[key_19_$f] = data.schema[key_19_$f];
          }
        }
        result_getSchemaDefaults_19_$f = defaults_19_$f;
      }
    }
    const defaults = $orderedTargetsTrait in trait2 ? getOrderedTrait(ctx, entity, trait2) : result_getSchemaDefaults_19_$f;
    if (traitCtx.type === "aos") {
      setTrait(ctx, entity, trait2, params ?? defaults, false);
    } else if (defaults) {
      setTrait(ctx, entity, trait2, {
        ...defaults,
        ...params
      }, false);
    } else if (params) {
      setTrait(ctx, entity, trait2, params, false);
    }
    for (const sub of data.addSubscriptions) sub(entity);
  }
}
function removeTrait(ctx, entity, ...traits) {
  for (let i = 0; i < traits.length; i++) {
    const trait2 = traits[i];
    if (trait2?.[$relationPair]) {
      let result_removeRelationPair_34_$f;
      const relation_34_$f = trait2.relation;
      const target_34_$f = trait2.target;
      const relationTrait_34_$f = relation_34_$f[$internal].trait;
      if (!hasTrait(ctx, entity, relationTrait_34_$f)) {
        result_removeRelationPair_34_$f = void 0;
      } else {
        const instance_34_$f = ctx.traitInstances[relationTrait_34_$f.id];
        if (target_34_$f === "*") {
          if (instance_34_$f) {
            let result_getRelationTargets_36_$f;
            const relationCtx_36_$f = relation_34_$f[$internal];
            const traitData_36_$f = ctx.traitInstances[relationCtx_36_$f.trait.id];
            if (!traitData_36_$f || !traitData_36_$f.relationTargets) {
              result_getRelationTargets_36_$f = [];
            } else {
              const eid_36_$f = entity & ENTITY_ID_MASK;
              const p_36_$f = eid_36_$f >>> 10, o_36_$f = eid_36_$f & 1023;
              const page_36_$f = traitData_36_$f.relationTargets[p_36_$f];
              if (!page_36_$f) {
                result_getRelationTargets_36_$f = [];
              } else {
                if (relationCtx_36_$f.exclusive) {
                  const target_36_$f = page_36_$f[o_36_$f];
                  result_getRelationTargets_36_$f = target_36_$f !== void 0 ? [target_36_$f] : [];
                } else {
                  const targets_36_$f = page_36_$f[o_36_$f];
                  result_getRelationTargets_36_$f = targets_36_$f !== void 0 ? targets_36_$f.slice() : [];
                }
              }
            }
            const targets_34_$f = result_getRelationTargets_36_$f;
            for (const t_34_$f of targets_34_$f) {
              for (const sub_34_$f of instance_34_$f.removeSubscriptions) sub_34_$f(entity, t_34_$f);
            }
          }
          removeAllRelationTargets(ctx, relation_34_$f, entity);
          removeTraitFromEntity(ctx, entity, relationTrait_34_$f);
          result_removeRelationPair_34_$f = void 0;
        } else {
          if (typeof target_34_$f === "number") {
            if (instance_34_$f) {
              for (const sub_34_$f of instance_34_$f.removeSubscriptions) sub_34_$f(entity, target_34_$f);
            }
            const {
              removedIndex,
              wasLastTarget
            } = removeRelationTarget(ctx, relation_34_$f, entity, target_34_$f);
            if (removedIndex === -1) {
              result_removeRelationPair_34_$f = void 0;
            } else {
              if (wasLastTarget) {
                removeTraitFromEntity(ctx, entity, relationTrait_34_$f);
              }
            }
          }
        }
      }
      result_removeRelationPair_34_$f;
      continue;
    }
    if (!hasTrait(ctx, entity, trait2)) continue;
    const traitCtx = trait2[$internal];
    if (traitCtx.relation) {
      const instance = ctx.traitInstances[trait2.id];
      if (instance) {
        let result_getRelationTargets_38_$f;
        const relationCtx_38_$f = traitCtx.relation[$internal];
        const traitData_38_$f = ctx.traitInstances[relationCtx_38_$f.trait.id];
        if (!traitData_38_$f || !traitData_38_$f.relationTargets) {
          result_getRelationTargets_38_$f = [];
        } else {
          const eid_38_$f = entity & ENTITY_ID_MASK;
          const p_38_$f = eid_38_$f >>> 10, o_38_$f = eid_38_$f & 1023;
          const page_38_$f = traitData_38_$f.relationTargets[p_38_$f];
          if (!page_38_$f) {
            result_getRelationTargets_38_$f = [];
          } else {
            if (relationCtx_38_$f.exclusive) {
              const target_38_$f = page_38_$f[o_38_$f];
              result_getRelationTargets_38_$f = target_38_$f !== void 0 ? [target_38_$f] : [];
            } else {
              const targets_38_$f = page_38_$f[o_38_$f];
              result_getRelationTargets_38_$f = targets_38_$f !== void 0 ? targets_38_$f.slice() : [];
            }
          }
        }
        const targets = result_getRelationTargets_38_$f;
        for (const t of targets) {
          for (const sub of instance.removeSubscriptions) sub(entity, t);
        }
      }
      removeAllRelationTargets(ctx, traitCtx.relation, entity);
    } else {
      const instance = ctx.traitInstances[trait2.id];
      if (instance) {
        for (const sub of instance.removeSubscriptions) sub(entity);
      }
    }
    removeTraitFromEntity(ctx, entity, trait2);
  }
}
function cleanupRelationTarget(ctx, relation2, entity, target) {
  const relationTrait = relation2[$internal].trait;
  const instance = ctx.traitInstances[relationTrait.id];
  if (instance) {
    for (const sub of instance.removeSubscriptions) sub(entity, target);
  }
  const {
    removedIndex,
    wasLastTarget
  } = removeRelationTarget(ctx, relation2, entity, target);
  if (removedIndex === -1) return;
  if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
}
function hasTrait(ctx, entity, trait2) {
  const instance = ctx.traitInstances[trait2.id];
  if (!instance) return false;
  const {
    generationId,
    bitflag
  } = instance;
  const eid = entity & ENTITY_ID_MASK;
  const mask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];
  return (mask & bitflag) === bitflag;
}
function setTrait(ctx, entity, trait2, value, triggerChanged = true) {
  if (trait2?.[$relationPair]) {
    const relation_47_$f = trait2.relation;
    const target_47_$f = trait2.target;
    if (typeof target_47_$f !== "number") {
      result_setTraitForPair_47_$f = void 0;
    } else {
      setRelationData(ctx, entity, relation_47_$f, target_47_$f, value);
      if (triggerChanged) {
        setPairChanged(ctx, entity, relation_47_$f[$internal].trait, target_47_$f);
      }
    }
    return void 0;
  }
  const traitCtx_48_$f = trait2[$internal];
  const ctx_49_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
  const instance_49_$f = ctx_49_$f.traitInstances[trait2.id];
  const store_48_$f = instance_49_$f.store;
  const index_48_$f = entity & ENTITY_ID_MASK;
  value instanceof Function && (value = value(traitCtx_48_$f.get(index_48_$f, store_48_$f)));
  traitCtx_48_$f.set(index_48_$f, store_48_$f, value);
  triggerChanged && setChanged(ctx, entity, trait2);
  return;
}
function getTrait(ctx, entity, trait2) {
  if (trait2?.[$relationPair]) {
    let result_getTraitForPair_52_$f;
    const relation_52_$f = trait2.relation;
    const target_52_$f = trait2.target;
    if (!hasRelationPair(ctx, entity, trait2)) {
      result_getTraitForPair_52_$f = void 0;
    } else {
      if (typeof target_52_$f !== "number") {
        result_getTraitForPair_52_$f = void 0;
      } else {
        result_getTraitForPair_52_$f = getRelationData(ctx, entity, relation_52_$f, target_52_$f);
      }
    }
    return result_getTraitForPair_52_$f;
  }
  let result_getTraitForTrait_53_$f;
  if (!hasTrait(ctx, entity, trait2)) {
    result_getTraitForTrait_53_$f = void 0;
  } else {
    const traitCtx_53_$f = trait2[$internal];
    const ctx_54_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
    const instance_54_$f = ctx_54_$f.traitInstances[trait2.id];
    const store_53_$f = instance_54_$f.store;
    const data_53_$f = traitCtx_53_$f.get(entity & ENTITY_ID_MASK, store_53_$f);
    result_getTraitForTrait_53_$f = data_53_$f;
  }
  return result_getTraitForTrait_53_$f;
}
function removeTraitFromEntity(ctx, entity, trait2) {
  if (!hasTrait(ctx, entity, trait2)) return;
  const instance = ctx.traitInstances[trait2.id];
  const {
    generationId,
    bitflag,
    queries,
    trackingQueries
  } = instance;
  const eid = entity & ENTITY_ID_MASK;
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  ctx.entityMasks[generationId][pageId][offset] &= ~bitflag;
  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }
  for (const query of queries) {
    const match = query.relationFilters && query.relationFilters.length > 0 ? checkQueryWithRelations(ctx, query, entity) : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }
  for (const query of trackingQueries) {
    const match = query.relationFilters && query.relationFilters.length > 0 ? checkQueryTrackingWithRelations(ctx, query, entity, "remove", generationId, bitflag) : query.checkTracking(ctx, entity, "remove", generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }
  ctx.entityTraits.get(entity).delete(trait2);
}

// ../core/src/query/modifiers/changed.ts
function setChanged(ctx, entity, trait2) {
  let result_markChanged_4_$f;
  if (!hasTrait(ctx, entity, trait2)) {
    result_markChanged_4_$f = void 0;
  } else {
    const traitId_1_$f_4_$f = trait2.id;
    if (!(traitId_1_$f_4_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_1_$f_4_$f] !== void 0)) {
      registerTrait(ctx, trait2);
    }
    const data_4_$f = ctx.traitInstances[trait2.id];
    const eid_4_$f = entity & ENTITY_ID_MASK;
    const {
      generationId,
      bitflag
    } = data_4_$f;
    const pageId_4_$f = eid_4_$f >>> 10;
    const offset_4_$f = eid_4_$f & 1023;
    for (const changedMask_4_$f of ctx.changedMasks.values()) {
      ensureMaskPage(changedMask_4_$f[generationId], pageId_4_$f)[offset_4_$f] |= bitflag;
    }
    for (const query_4_$f of data_4_$f.trackingQueries) {
      if (!query_4_$f.hasChangedModifiers) {
        continue;
      }
      if (!query_4_$f.changedTraits.has(trait2)) {
        continue;
      }
      const match_4_$f = query_4_$f.relationFilters && query_4_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(ctx, query_4_$f, entity, "change", generationId, bitflag) : query_4_$f.checkTracking(ctx, entity, "change", generationId, bitflag);
      if (match_4_$f) {
        query_4_$f.add(entity);
      } else {
        query_4_$f.remove(ctx, entity);
      }
    }
    result_markChanged_4_$f = data_4_$f;
  }
  const data = result_markChanged_4_$f;
  if (!data) return;
  for (const sub of data.changeSubscriptions) sub(entity);
}
function setPairChanged(ctx, entity, trait2, target) {
  let result_markChanged_5_$f;
  if (!hasTrait(ctx, entity, trait2)) {
    result_markChanged_5_$f = void 0;
  } else {
    const traitId_1_$f_5_$f = trait2.id;
    if (!(traitId_1_$f_5_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_1_$f_5_$f] !== void 0)) {
      registerTrait(ctx, trait2);
    }
    const data_5_$f = ctx.traitInstances[trait2.id];
    const eid_5_$f = entity & ENTITY_ID_MASK;
    const {
      generationId,
      bitflag
    } = data_5_$f;
    const pageId_5_$f = eid_5_$f >>> 10;
    const offset_5_$f = eid_5_$f & 1023;
    for (const changedMask_5_$f of ctx.changedMasks.values()) {
      ensureMaskPage(changedMask_5_$f[generationId], pageId_5_$f)[offset_5_$f] |= bitflag;
    }
    for (const query_5_$f of data_5_$f.trackingQueries) {
      if (!query_5_$f.hasChangedModifiers) {
        continue;
      }
      if (!query_5_$f.changedTraits.has(trait2)) {
        continue;
      }
      const match_5_$f = query_5_$f.relationFilters && query_5_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(ctx, query_5_$f, entity, "change", generationId, bitflag) : query_5_$f.checkTracking(ctx, entity, "change", generationId, bitflag);
      if (match_5_$f) {
        query_5_$f.add(entity);
      } else {
        query_5_$f.remove(ctx, entity);
      }
    }
    result_markChanged_5_$f = data_5_$f;
  }
  const data = result_markChanged_5_$f;
  if (!data) return;
  for (const sub of data.changeSubscriptions) sub(entity, target);
}

// ../collections/src/sparse-set.ts
var SparseSet = class {
  _dense = [];
  _sparse = [];
  _cursor = 0;
  _denseRaw = {
    array: this._dense,
    length: 0
  };
  has(val) {
    const index = this._sparse[val];
    return index < this._cursor && this._dense[index] === val;
  }
  add(val) {
    if (this.has(val)) return;
    this._sparse[val] = this._cursor;
    this._dense[this._cursor++] = val;
  }
  remove(val) {
    if (!this.has(val)) return;
    const index = this._sparse[val];
    this._cursor--;
    const swapped = this._dense[this._cursor];
    if (swapped !== val) {
      this._dense[index] = swapped;
      this._sparse[swapped] = index;
    }
  }
  clear() {
    for (let i = 0; i < this._cursor; i++) {
      this._sparse[this._dense[i]] = 0;
    }
    this._cursor = 0;
  }
  sort() {
    this._dense.sort((a, b) => a - b);
    for (let i = 0; i < this._dense.length; i++) {
      this._sparse[this._dense[i]] = i;
    }
  }
  getIndex(val) {
    return this._sparse[val];
  }
  get dense() {
    return this._dense.slice(0, this._cursor);
  }
  get denseRaw() {
    this._denseRaw.length = this._cursor;
    return this._denseRaw;
  }
  get rawDense() {
    return this._dense;
  }
  get length() {
    return this._cursor;
  }
  get sparse() {
    return this._sparse;
  }
};

// ../collections/src/hi-sparse-bitset.ts
var EMPTY_BLOCK = new Uint32Array(32);

// ../core/src/query/query-result.ts
function createQueryResult(ctx, entities, query, params) {
  const traits = [];
  const stores = [];
  for (let i_0_$f = 0; i_0_$f < params.length; i_0_$f++) {
    const param_0_$f = params[i_0_$f];
    if (param_0_$f?.[$relationPair]) {
      const relation_0_$f = param_0_$f.relation;
      const baseTrait_0_$f = relation_0_$f[$internal].trait;
      if (baseTrait_0_$f[$internal].type !== "tag") {
        traits.push(baseTrait_0_$f);
        const ctx_25_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
        const instance_25_$f = ctx_25_$f.traitInstances[baseTrait_0_$f.id];
        stores.push(instance_25_$f.store);
      }
      continue;
    }
    if (param_0_$f?.[$modifier]) {
      if (param_0_$f.type === "not") {
        continue;
      }
      const modifierTraits_0_$f = param_0_$f.traits;
      for (const trait_0_$f of modifierTraits_0_$f) {
        if (trait_0_$f[$internal].type === "tag") {
          continue;
        }
        traits.push(trait_0_$f);
        const ctx_27_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
        const instance_27_$f = ctx_27_$f.traitInstances[trait_0_$f.id];
        stores.push(instance_27_$f.store);
      }
    } else {
      const trait_0_$f = param_0_$f;
      if (trait_0_$f[$internal].type === "tag") {
        continue;
      }
      traits.push(trait_0_$f);
      const ctx_28_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
      const instance_28_$f = ctx_28_$f.traitInstances[trait_0_$f.id];
      stores.push(instance_28_$f.store);
    }
  }
  const results = Object.assign(entities, {
    readEach(callback) {
      const state = Array.from({
        length: traits.length
      });
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eid = entity & ENTITY_ID_MASK;
        for (let i_2_$f = 0; i_2_$f < traits.length; i_2_$f++) {
          const trait_2_$f = traits[i_2_$f];
          const ctx_2_$f = trait_2_$f[$internal];
          const value_2_$f = ctx_2_$f.get(eid, stores[i_2_$f]);
          state[i_2_$f] = value_2_$f;
        }
        callback(state, entity, i);
      }
      return results;
    },
    updateEach(callback, options = {
      changeDetection: "auto"
    }) {
      const state = Array.from({
        length: traits.length
      });
      if (options.changeDetection === "auto") {
        const changedPairs = [];
        const atomicSnapshots = [];
        const trackedIndices = [];
        const untrackedIndices = [];
        for (let i_3_$f = 0; i_3_$f < traits.length; i_3_$f++) {
          const trait_3_$f = traits[i_3_$f];
          const hasTracked_3_$f = ctx.trackedTraits.has(trait_3_$f);
          const hasChanged_3_$f = query.hasChangedModifiers && query.changedTraits.has(trait_3_$f);
          if (hasTracked_3_$f || hasChanged_3_$f) {
            trackedIndices.push(i_3_$f);
          } else {
            untrackedIndices.push(i_3_$f);
          }
        }
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = entity & ENTITY_ID_MASK;
          for (let j_5_$f = 0; j_5_$f < traits.length; j_5_$f++) {
            const trait_5_$f = traits[j_5_$f];
            const ctx_5_$f = trait_5_$f[$internal];
            const value_5_$f = ctx_5_$f.get(eid, stores[j_5_$f]);
            state[j_5_$f] = value_5_$f;
            atomicSnapshots[j_5_$f] = ctx_5_$f.type === "aos" ? {
              ...value_5_$f
            } : null;
          }
          callback(state, entity, i);
          let result_isEntityAlive_6_$f;
          const entityId_6_$f = entity & ENTITY_ID_MASK;
          const denseIdx_6_$f = ctx.entityIndex.sparse[entityId_6_$f];
          if (denseIdx_6_$f === void 0 || denseIdx_6_$f >= ctx.entityIndex.aliveCount) {
            result_isEntityAlive_6_$f = false;
          } else {
            result_isEntityAlive_6_$f = ctx.entityIndex.dense[denseIdx_6_$f] === entity;
          }
          if (!result_isEntityAlive_6_$f) continue;
          for (let j = 0; j < trackedIndices.length; j++) {
            const index = trackedIndices[j];
            const trait2 = traits[index];
            const traitCtx = trait2[$internal];
            const newValue = state[index];
            const store = stores[index];
            let changed = false;
            if (traitCtx.type === "aos") {
              changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
              if (!changed) {
                changed = !shallowEqual(newValue, atomicSnapshots[index]);
              }
            } else {
              changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
            }
            if (changed) changedPairs.push([entity, trait2]);
          }
          for (let j = 0; j < untrackedIndices.length; j++) {
            const index = untrackedIndices[j];
            const trait2 = traits[index];
            const traitCtx = trait2[$internal];
            const store = stores[index];
            traitCtx.fastSet(eid, store, state[index]);
          }
        }
        for (let i = 0; i < changedPairs.length; i++) {
          const [entity, trait2] = changedPairs[i];
          setChanged(ctx, entity, trait2);
        }
      } else if (options.changeDetection === "always") {
        const changedPairs = [];
        const atomicSnapshots = [];
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = entity & ENTITY_ID_MASK;
          for (let j_9_$f = 0; j_9_$f < traits.length; j_9_$f++) {
            const trait_9_$f = traits[j_9_$f];
            const ctx_9_$f = trait_9_$f[$internal];
            const value_9_$f = ctx_9_$f.get(eid, stores[j_9_$f]);
            state[j_9_$f] = value_9_$f;
            atomicSnapshots[j_9_$f] = ctx_9_$f.type === "aos" ? {
              ...value_9_$f
            } : null;
          }
          callback(state, entity, i);
          let result_isEntityAlive_10_$f;
          const entityId_10_$f = entity & ENTITY_ID_MASK;
          const denseIdx_10_$f = ctx.entityIndex.sparse[entityId_10_$f];
          if (denseIdx_10_$f === void 0 || denseIdx_10_$f >= ctx.entityIndex.aliveCount) {
            result_isEntityAlive_10_$f = false;
          } else {
            result_isEntityAlive_10_$f = ctx.entityIndex.dense[denseIdx_10_$f] === entity;
          }
          if (!result_isEntityAlive_10_$f) continue;
          for (let j = 0; j < traits.length; j++) {
            const trait2 = traits[j];
            const traitCtx = trait2[$internal];
            const newValue = state[j];
            let changed = false;
            if (traitCtx.type === "aos") {
              changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
              if (!changed) {
                changed = !shallowEqual(newValue, atomicSnapshots[j]);
              }
            } else {
              changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
            }
            if (changed) changedPairs.push([entity, trait2]);
          }
        }
        for (let i = 0; i < changedPairs.length; i++) {
          const [entity, trait2] = changedPairs[i];
          setChanged(ctx, entity, trait2);
        }
      } else if (options.changeDetection === "never") {
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          const eid = entity & ENTITY_ID_MASK;
          for (let i_13_$f = 0; i_13_$f < traits.length; i_13_$f++) {
            const trait_13_$f = traits[i_13_$f];
            const ctx_13_$f = trait_13_$f[$internal];
            const value_13_$f = ctx_13_$f.get(eid, stores[i_13_$f]);
            state[i_13_$f] = value_13_$f;
          }
          callback(state, entity, i);
          let result_isEntityAlive_14_$f;
          const entityId_14_$f = entity & ENTITY_ID_MASK;
          const denseIdx_14_$f = ctx.entityIndex.sparse[entityId_14_$f];
          if (denseIdx_14_$f === void 0 || denseIdx_14_$f >= ctx.entityIndex.aliveCount) {
            result_isEntityAlive_14_$f = false;
          } else {
            result_isEntityAlive_14_$f = ctx.entityIndex.dense[denseIdx_14_$f] === entity;
          }
          if (!result_isEntityAlive_14_$f) continue;
          for (let j = 0; j < traits.length; j++) {
            const trait2 = traits[j];
            const traitCtx = trait2[$internal];
            traitCtx.fastSet(eid, stores[j], state[j]);
          }
        }
      }
      return results;
    },
    useStores(callback) {
      callback(stores, entities);
      return results;
    },
    select(...params2) {
      traits.length = 0;
      stores.length = 0;
      for (let i_16_$f = 0; i_16_$f < params2.length; i_16_$f++) {
        const param_16_$f = params2[i_16_$f];
        if (param_16_$f?.[$relationPair]) {
          const relation_16_$f = param_16_$f.relation;
          const baseTrait_16_$f = relation_16_$f[$internal].trait;
          if (baseTrait_16_$f[$internal].type !== "tag") {
            traits.push(baseTrait_16_$f);
            const ctx_18_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
            const instance_18_$f = ctx_18_$f.traitInstances[baseTrait_16_$f.id];
            stores.push(instance_18_$f.store);
          }
          continue;
        }
        if (param_16_$f?.[$modifier]) {
          if (param_16_$f.type === "not") {
            continue;
          }
          const modifierTraits_16_$f = param_16_$f.traits;
          for (const trait_16_$f of modifierTraits_16_$f) {
            if (trait_16_$f[$internal].type === "tag") {
              continue;
            }
            traits.push(trait_16_$f);
            const ctx_20_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
            const instance_20_$f = ctx_20_$f.traitInstances[trait_16_$f.id];
            stores.push(instance_20_$f.store);
          }
        } else {
          const trait_16_$f = param_16_$f;
          if (trait_16_$f[$internal].type === "tag") {
            continue;
          }
          traits.push(trait_16_$f);
          const ctx_21_$f = "traitInstances" in ctx ? ctx : ctx[$internal];
          const instance_21_$f = ctx_21_$f.traitInstances[trait_16_$f.id];
          stores.push(instance_21_$f.store);
        }
      }
      return results;
    },
    sort(callback = (a, b) => (a & ENTITY_ID_MASK) - (b & ENTITY_ID_MASK)) {
      Array.prototype.sort.call(entities, callback);
      return results;
    }
  });
  return results;
}
var relationOnlyMethods = {
  readEach(callback) {
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  updateEach(callback) {
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  useStores(callback) {
    callback([], this);
    return this;
  },
  select() {
    return this;
  },
  sort(callback = (a, b) => (a & ENTITY_ID_MASK) - (b & ENTITY_ID_MASK)) {
    Array.prototype.sort.call(this, callback);
    return this;
  }
};
var cachedEmptyRelationResult = Object.assign([], relationOnlyMethods);

// ../core/src/query/utils/create-query-hash.ts
var MODIFIER_FACTOR = 1e5;
var RELATION_FACTOR = 1e7;
var RELATION_OFFSET = 5e6;
var RELATION_QUERY_OFFSET = 9e6;
var sortBuf = new Float64Array(1024);
var nextQueryId = 1;
var queryHashToId = /* @__PURE__ */ new Map();
function queryHashNumericId(hash) {
  let id = queryHashToId.get(hash);
  if (id === void 0) {
    id = nextQueryId++;
    queryHashToId.set(hash, id);
  }
  return id;
}
var createQueryHash = (parameters) => {
  let cursor = 0;
  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];
    if (param?.[$relationPair]) {
      const relationId = param.relation[$internal].trait.id;
      if (param.targetQuery) {
        const subHash = param.targetQuery?.[$queryRef] ? param.targetQuery.hash : createQueryHash([...param.targetQuery]);
        sortBuf[cursor++] = relationId * RELATION_FACTOR + queryHashNumericId(subHash) + RELATION_QUERY_OFFSET;
        continue;
      }
      const target = param.target;
      const targetId = typeof target === "number" ? target : -1;
      sortBuf[cursor++] = relationId * RELATION_FACTOR + targetId + RELATION_OFFSET;
      continue;
    }
    if (param?.[$modifier]) {
      for (let j = 0; j < param.traitIds.length; j++) {
        sortBuf[cursor++] = param.id * MODIFIER_FACTOR + param.traitIds[j];
      }
      continue;
    }
    sortBuf[cursor++] = param.id;
  }
  const filled = sortBuf.subarray(0, cursor);
  filled.sort();
  return filled.join(",");
};

// ../core/src/query/query.ts
var IsExcluded = trait();
function resolveRelationFilter(filter) {
  if (!filter.targetQuery) return filter;
  const targetQueryRef = filter.targetQuery?.[$queryRef] ? filter.targetQuery : createQuery(...filter.targetQuery);
  return {
    ...filter,
    targetQueryRef,
    targetQueryMatches: new SparseSet()
  };
}
function runQuery(ctx, query, params) {
  commitQueryRemovals(ctx);
  const entities = query.entities.dense.slice();
  if (query.isTracking) {
    query.entities.clear();
    const len = entities.length;
    for (let i = 0; i < len; i++) {
      query.resetTrackingBitmasks(entities[i] & ENTITY_ID_MASK);
    }
  }
  return createQueryResult(ctx, entities, query, params);
}
function addEntityToQuery(query, entity) {
  query.toRemove.remove(entity);
  query.entities.add(entity);
  for (const sub of query.addSubscriptions) {
    sub(entity);
  }
  query.version++;
}
function removeEntityFromQuery(ctx, query, entity) {
  if (!query.entities.has(entity) || query.toRemove.has(entity)) return;
  query.toRemove.add(entity);
  ctx.dirtyQueries.add(query);
  for (const sub of query.removeSubscriptions) {
    sub(entity);
  }
  query.version++;
}
function commitQueryRemovals(ctx) {
  if (!ctx.dirtyQueries.size) return;
  for (const query of ctx.dirtyQueries) {
    for (let i = query.toRemove.dense.length - 1; i >= 0; i--) {
      const eid = query.toRemove.dense[i];
      query.toRemove.remove(eid);
      query.entities.remove(eid);
    }
  }
  ctx.dirtyQueries.clear();
}
function resetQueryTrackingBitmasks(query, eid) {
  const groups = query.trackingGroups;
  const len = groups.length;
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  for (let i = 0; i < len; i++) {
    const trackers = groups[i].trackers;
    const trackersLen = trackers.length;
    for (let j = 0; j < trackersLen; j++) {
      const page = trackers[j][pageId];
      if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
    }
  }
}
function processTrackingModifier(ctx, query, modifier, logic, groupsMap) {
  const trackingType = getTrackingType(modifier);
  if (!trackingType) return;
  const id = modifier.id;
  const key = `${trackingType}-${id}-${logic}`;
  let group = groupsMap.get(key);
  if (!group) {
    group = {
      logic,
      type: trackingType,
      id,
      bitmasks: [],
      trackers: []
    };
    groupsMap.set(key, group);
    query.trackingGroups.push(group);
  }
  for (const trait2 of modifier.traits) {
    const traitId_2_$f = trait2.id;
    if (!(traitId_2_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_2_$f] !== void 0)) registerTrait(ctx, trait2);
    const instance = ctx.traitInstances[trait2.id];
    query.traits.push(trait2);
    query.traitInstances.all.push(instance);
    const genId = instance.generationId;
    group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;
    if (trackingType === "change") {
      query.changedTraits.add(trait2);
      query.hasChangedModifiers = true;
    }
  }
  query.isTracking = true;
}
function createQueryInstance(ctx, parameters) {
  const query = {
    version: 0,
    ctx,
    parameters,
    hash: "",
    traits: [],
    traitInstances: {
      required: [],
      forbidden: [],
      or: [],
      all: []
    },
    staticBitmasks: [],
    trackingGroups: [],
    generations: [],
    entities: new SparseSet(),
    isTracking: false,
    hasChangedModifiers: false,
    changedTraits: /* @__PURE__ */ new Set(),
    toRemove: new SparseSet(),
    cleanup: [],
    addSubscriptions: /* @__PURE__ */ new Set(),
    removeSubscriptions: /* @__PURE__ */ new Set(),
    relationFilters: [],
    run: (ctx2, params) => runQuery(ctx2, query, params),
    add: (entity) => addEntityToQuery(query, entity),
    remove: (ctx2, entity) => removeEntityFromQuery(ctx2, query, entity),
    check: (ctx2, entity) => checkQuery(ctx2, query, entity),
    checkTracking: (ctx2, entity, eventType, generationId, bitflag) => checkQueryTracking(ctx2, query, entity, eventType, generationId, bitflag),
    resetTrackingBitmasks: (eid) => resetQueryTrackingBitmasks(query, eid)
  };
  const trackingGroupsMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (parameter?.[$relationPair]) {
      const relation2 = parameter.relation;
      query.relationFilters.push(resolveRelationFilter(parameter));
      const baseTrait = relation2[$internal].trait;
      const traitId_5_$f = baseTrait.id;
      if (!(traitId_5_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_5_$f] !== void 0)) registerTrait(ctx, baseTrait);
      query.traitInstances.required.push(ctx.traitInstances[baseTrait.id]);
      query.traits.push(baseTrait);
      continue;
    }
    if (parameter?.[$modifier]) {
      const traits = parameter.traits;
      for (let j = 0; j < traits.length; j++) {
        const t = traits[j];
        const traitId_8_$f = t.id;
        if (!(traitId_8_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_8_$f] !== void 0)) registerTrait(ctx, t);
      }
      if (parameter.type === "not") {
        query.traitInstances.forbidden.push(...traits.map((t) => ctx.traitInstances[t.id]));
      } else if (parameter.type === "or") {
        query.traitInstances.or.push(...traits.map((t) => ctx.traitInstances[t.id]));
        if (isOrWithModifiers(parameter)) {
          for (const nestedModifier of parameter.modifiers) {
            if (isTrackingModifier(nestedModifier)) {
              processTrackingModifier(ctx, query, nestedModifier, "or", trackingGroupsMap);
            }
          }
        }
      } else if (isTrackingModifier(parameter)) {
        processTrackingModifier(ctx, query, parameter, "and", trackingGroupsMap);
      }
    } else {
      const t = parameter;
      const traitId_11_$f = t.id;
      if (!(traitId_11_$f < ctx.traitInstances.length && ctx.traitInstances[traitId_11_$f] !== void 0)) registerTrait(ctx, t);
      query.traitInstances.required.push(ctx.traitInstances[t.id]);
      query.traits.push(t);
    }
  }
  query.traitInstances.forbidden.push(ctx.traitInstances[IsExcluded.id]);
  query.traitInstances.all = [...query.traitInstances.all, ...query.traitInstances.required, ...query.traitInstances.forbidden, ...query.traitInstances.or];
  query.generations = query.traitInstances.all.map((c) => c.generationId).reduce((a, v) => {
    if (a.includes(v)) return a;
    a.push(v);
    return a;
  }, []);
  query.staticBitmasks = query.generations.map((generationId) => {
    const required = query.traitInstances.required.filter((c) => c.generationId === generationId).reduce((a, c) => a | c.bitflag, 0);
    const forbidden = query.traitInstances.forbidden.filter((c) => c.generationId === generationId).reduce((a, c) => a | c.bitflag, 0);
    const or = query.traitInstances.or.filter((c) => c.generationId === generationId).reduce((a, c) => a | c.bitflag, 0);
    return {
      required,
      forbidden,
      or
    };
  });
  query.hash = createQueryHash(parameters);
  ctx.queriesHashMap.set(query.hash, query);
  if (query.isTracking) {
    query.traitInstances.all.forEach((instance) => {
      instance.trackingQueries.add(query);
    });
  } else {
    query.traitInstances.all.forEach((instance) => {
      instance.queries.add(query);
    });
  }
  if (query.traitInstances.forbidden.length > 0) ctx.notQueries.add(query);
  const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;
  if (hasRelationFilters) {
    for (const pair of query.relationFilters) {
      const relationTrait = pair.relation[$internal].trait;
      const relationTraitInstance = ctx.traitInstances[relationTrait.id];
      if (relationTraitInstance) {
        relationTraitInstance.relationQueries.add(query);
      }
      if (pair.targetQueryRef && pair.targetQueryMatches) {
        const matchingTargets = queryInternal(ctx, pair.targetQueryRef);
        for (let i = 0; i < matchingTargets.length; i++) {
          pair.targetQueryMatches.add(matchingTargets[i]);
        }
        const refreshSourcesForTarget = (target) => {
          const sources = getEntitiesWithRelationTo(ctx, pair.relation, target);
          for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            const match = checkQueryWithRelations(ctx, query, source);
            if (match) {
              query.add(source);
            } else {
              query.remove(ctx, source);
            }
          }
        };
        query.cleanup.push(subscribeQueryAdd(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches.add(target);
          refreshSourcesForTarget(target);
        }));
        query.cleanup.push(subscribeQueryRemove(ctx, pair.targetQueryRef, (target) => {
          pair.targetQueryMatches.remove(target);
          refreshSourcesForTarget(target);
        }));
      }
    }
  }
  if (query.trackingGroups.length > 0) {
    for (const group of query.trackingGroups) {
      const {
        type,
        id,
        logic,
        bitmasks
      } = group;
      const snapshot = ctx.trackingSnapshots.get(id);
      const dirtyMask = ctx.dirtyMasks.get(id);
      const changedMask = ctx.changedMasks.get(id);
      for (const entity of ctx.entityIndex.dense) {
        if (query.entities.has(entity)) continue;
        const eid = entity & ENTITY_ID_MASK;
        let matches = logic === "and";
        for (let genId = 0; genId < bitmasks.length; genId++) {
          const mask = bitmasks[genId];
          if (!mask) continue;
          const pageId = eid >>> 10;
          const offset = eid & 1023;
          const oldMask = snapshot[genId][pageId][offset];
          const currentMask = ctx.entityMasks[genId][pageId][offset];
          for (let bit = 1; bit <= mask; bit <<= 1) {
            if (!(mask & bit)) continue;
            let traitMatches = false;
            switch (type) {
              case "add":
                traitMatches = (oldMask & bit) === 0 && (currentMask & bit) === bit;
                break;
              case "remove":
                traitMatches = (oldMask & bit) === bit && (currentMask & bit) === 0 || (oldMask & bit) === 0 && (currentMask & bit) === 0 && (dirtyMask[genId][pageId][offset] & bit) === bit;
                break;
              case "change":
                traitMatches = (changedMask[genId][pageId][offset] & bit) === bit;
                break;
            }
            if (logic === "and") {
              if (!traitMatches) {
                matches = false;
                break;
              }
            } else {
              if (traitMatches) {
                matches = true;
                break;
              }
            }
          }
          if (logic === "and" && !matches) break;
          if (logic === "or" && matches) break;
        }
        if (matches) {
          if (hasRelationFilters) {
            let relationMatch = true;
            for (const pair of query.relationFilters) {
              if (!hasRelationPair(ctx, entity, pair)) {
                relationMatch = false;
                break;
              }
            }
            if (relationMatch) query.add(entity);
          } else {
            query.add(entity);
          }
        }
      }
    }
  } else {
    const entities = ctx.entityIndex.dense;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const match = hasRelationFilters ? checkQueryWithRelations(ctx, query, entity) : query.check(ctx, entity);
      if (match) query.add(entity);
    }
  }
  return query;
}
function resolveQueryInstance(ctx, params) {
  const hash = createQueryHash(params);
  let query = ctx.queriesHashMap.get(hash);
  if (!query) {
    query = createQueryInstance(ctx, params);
    ctx.queriesHashMap.set(hash, query);
  }
  return query;
}
function resolveQueryInstanceFromRef(ctx, queryRef) {
  let query = ctx.queryInstances[queryRef.id];
  if (query) return query;
  query = ctx.queriesHashMap.get(queryRef.hash);
  if (!query) {
    query = createQueryInstance(ctx, queryRef.parameters);
    ctx.queriesHashMap.set(queryRef.hash, query);
    if (queryRef.id >= ctx.queryInstances.length) {
      ctx.queryInstances.length = queryRef.id + 1;
    }
    ctx.queryInstances[queryRef.id] = query;
  }
  return query;
}
function queryInternal(ctx, ...args) {
  if (args.length === 1 && args[0]?.[$queryRef]) {
    const instance2 = resolveQueryInstanceFromRef(ctx, args[0]);
    return instance2.run(ctx, args[0].parameters);
  }
  const params = args;
  const instance = resolveQueryInstance(ctx, params);
  return instance.run(ctx, params);
}
function subscribeQueryAdd(ctx, args, callback) {
  let query;
  if (args?.[$queryRef]) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args);
  }
  query.addSubscriptions.add(callback);
  return () => query.addSubscriptions.delete(callback);
}
function subscribeQueryRemove(ctx, args, callback) {
  let query;
  if (args?.[$queryRef]) {
    query = resolveQueryInstanceFromRef(ctx, args);
  } else {
    query = resolveQueryInstance(ctx, args);
  }
  query.removeSubscriptions.add(callback);
  return () => query.removeSubscriptions.delete(callback);
}
var queryId = 0;
function createQuery(...parameters) {
  const hash = createQueryHash(parameters);
  const existing = universe.cachedQueries.get(hash);
  if (existing) return existing;
  const id = queryId++;
  const queryRef = Object.freeze({
    [$queryRef]: true,
    id,
    hash,
    parameters
  });
  universe.cachedQueries.set(hash, queryRef);
  return queryRef;
}

// ../core/src/entity/utils/entity-index.ts
var releaseEntity = (index, entity) => {
  const entityId = entity & ENTITY_ID_MASK;
  const denseIdx = index.sparse[entityId];
  if (denseIdx === void 0 || denseIdx >= index.aliveCount) return;
  const allocator = index.allocator;
  const pageId = entityId >>> 10;
  const offset = entityId & 1023;
  allocator.pageAliveCounts[pageId]--;
  const nextGen = (entity >>> GENERATION_SHIFT & GENERATION_MASK) + 1 & GENERATION_MASK;
  allocator.generations[pageId][offset] = nextGen;
  const deadEntry = packEntity(nextGen, entityId);
  const lastIdx = index.aliveCount - 1;
  const lastEntity = index.dense[lastIdx];
  const lastId = lastEntity & ENTITY_ID_MASK;
  index.sparse[lastId] = denseIdx;
  index.dense[denseIdx] = lastEntity;
  index.sparse[entityId] = lastIdx;
  index.dense[lastIdx] = deadEntry;
  index.aliveCount--;
};

// ../core/src/entity/entity-methods-patch.ts
Number.prototype.add = function(...traits) {
  return addTrait(getEntityContext(this), this, ...traits);
};
Number.prototype.remove = function(...traits) {
  return removeTrait(getEntityContext(this), this, ...traits);
};
Number.prototype.has = function(trait2) {
  return entityHas(getEntityContext(this), this, trait2);
};
Number.prototype.destroy = function() {
  return destroyEntity(getEntityContext(this), this);
};
Number.prototype.changed = function(trait2) {
  return setChanged(getEntityContext(this), this, trait2);
};
Number.prototype.get = function(trait2) {
  return getTrait(getEntityContext(this), this, trait2);
};
Number.prototype.set = function(trait2, value, triggerChanged = true) {
  setTrait(getEntityContext(this), this, trait2, value, triggerChanged);
};
Number.prototype.targetsFor = function(relation2) {
  let result_getRelationTargets_0_$f;
  const relationCtx_0_$f = relation2[$internal];
  const traitData_0_$f = getEntityContext(this).traitInstances[relationCtx_0_$f.trait.id];
  if (!traitData_0_$f || !traitData_0_$f.relationTargets) {
    result_getRelationTargets_0_$f = [];
  } else {
    const eid_0_$f = this & ENTITY_ID_MASK;
    const p_0_$f = eid_0_$f >>> 10, o_0_$f = eid_0_$f & 1023;
    const page_0_$f = traitData_0_$f.relationTargets[p_0_$f];
    if (!page_0_$f) {
      result_getRelationTargets_0_$f = [];
    } else {
      if (relationCtx_0_$f.exclusive) {
        const target_0_$f = page_0_$f[o_0_$f];
        result_getRelationTargets_0_$f = target_0_$f !== void 0 ? [target_0_$f] : [];
      } else {
        const targets_0_$f = page_0_$f[o_0_$f];
        result_getRelationTargets_0_$f = targets_0_$f !== void 0 ? targets_0_$f.slice() : [];
      }
    }
  }
  return result_getRelationTargets_0_$f;
};
Number.prototype.targetFor = function(relation2) {
  let result_getFirstRelationTarget_1_$f;
  const relationCtx_1_$f = relation2[$internal];
  const traitData_1_$f = getEntityContext(this).traitInstances[relationCtx_1_$f.trait.id];
  if (!traitData_1_$f || !traitData_1_$f.relationTargets) {
    result_getFirstRelationTarget_1_$f = void 0;
  } else {
    const eid_1_$f = this & ENTITY_ID_MASK;
    const page_1_$f = traitData_1_$f.relationTargets[eid_1_$f >>> 10];
    if (!page_1_$f) {
      result_getFirstRelationTarget_1_$f = void 0;
    } else {
      if (relationCtx_1_$f.exclusive) {
        result_getFirstRelationTarget_1_$f = page_1_$f[eid_1_$f & 1023];
      } else {
        result_getFirstRelationTarget_1_$f = page_1_$f[eid_1_$f & 1023]?.[0];
      }
    }
  }
  return result_getFirstRelationTarget_1_$f;
};
Number.prototype.id = function() {
  return this & ENTITY_ID_MASK;
};
Number.prototype.generation = function() {
  return this >>> GENERATION_SHIFT & GENERATION_MASK;
};
Number.prototype.isAlive = function() {
  const eid = this & ENTITY_ID_MASK;
  const owner = universe.pageAllocator.pageOwners[eid >>> 10];
  if (!owner) return false;
  const idx = owner.entityIndex;
  const denseIdx = idx.sparse[eid];
  if (denseIdx === void 0 || denseIdx >= idx.aliveCount) return false;
  return idx.dense[denseIdx] === this;
};

// ../core/src/entity/entity.ts
var cachedSet = /* @__PURE__ */ new Set();
var cachedQueue = [];
function destroyEntity(ctx, entity) {
  let result_isEntityAlive_1_$f;
  const entityId_1_$f = entity & ENTITY_ID_MASK;
  const denseIdx_1_$f = ctx.entityIndex.sparse[entityId_1_$f];
  if (denseIdx_1_$f === void 0 || denseIdx_1_$f >= ctx.entityIndex.aliveCount) {
    result_isEntityAlive_1_$f = false;
  } else {
    result_isEntityAlive_1_$f = ctx.entityIndex.dense[denseIdx_1_$f] === entity;
  }
  if (!result_isEntityAlive_1_$f) throw new Error("Koota: The entity being destroyed does not exist.");
  const entityQueue = cachedQueue;
  const processedEntities = cachedSet;
  entityQueue.length = 0;
  entityQueue.push(entity);
  processedEntities.clear();
  while (entityQueue.length > 0) {
    const currentEntity = entityQueue.pop();
    if (processedEntities.has(currentEntity)) continue;
    processedEntities.add(currentEntity);
    for (const relation2 of ctx.relations) {
      const relationCtx = relation2[$internal];
      const sources = getEntitiesWithRelationTo(ctx, relation2, currentEntity);
      for (const source of sources) {
        let result_isEntityAlive_2_$f;
        const entityId_2_$f = source & ENTITY_ID_MASK;
        const denseIdx_2_$f = ctx.entityIndex.sparse[entityId_2_$f];
        if (denseIdx_2_$f === void 0 || denseIdx_2_$f >= ctx.entityIndex.aliveCount) {
          result_isEntityAlive_2_$f = false;
        } else {
          result_isEntityAlive_2_$f = ctx.entityIndex.dense[denseIdx_2_$f] === source;
        }
        if (!result_isEntityAlive_2_$f) continue;
        cleanupRelationTarget(ctx, relation2, source, currentEntity);
        if (relationCtx.autoDestroy === "source") entityQueue.push(source);
      }
      if (relationCtx.autoDestroy === "target") {
        let result_getRelationTargets_3_$f;
        const relationCtx_3_$f = relation2[$internal];
        const traitData_3_$f = ctx.traitInstances[relationCtx_3_$f.trait.id];
        if (!traitData_3_$f || !traitData_3_$f.relationTargets) {
          result_getRelationTargets_3_$f = [];
        } else {
          const eid_3_$f = currentEntity & ENTITY_ID_MASK;
          const p_3_$f = eid_3_$f >>> 10, o_3_$f = eid_3_$f & 1023;
          const page_3_$f = traitData_3_$f.relationTargets[p_3_$f];
          if (!page_3_$f) {
            result_getRelationTargets_3_$f = [];
          } else {
            if (relationCtx_3_$f.exclusive) {
              const target_3_$f = page_3_$f[o_3_$f];
              result_getRelationTargets_3_$f = target_3_$f !== void 0 ? [target_3_$f] : [];
            } else {
              const targets_3_$f = page_3_$f[o_3_$f];
              result_getRelationTargets_3_$f = targets_3_$f !== void 0 ? targets_3_$f.slice() : [];
            }
          }
        }
        const targets = result_getRelationTargets_3_$f;
        for (const target of targets) {
          let result_isEntityAlive_4_$f;
          const entityId_4_$f = target & ENTITY_ID_MASK;
          const denseIdx_4_$f = ctx.entityIndex.sparse[entityId_4_$f];
          if (denseIdx_4_$f === void 0 || denseIdx_4_$f >= ctx.entityIndex.aliveCount) {
            result_isEntityAlive_4_$f = false;
          } else {
            result_isEntityAlive_4_$f = ctx.entityIndex.dense[denseIdx_4_$f] === target;
          }
          if (!result_isEntityAlive_4_$f) continue;
          if (!processedEntities.has(target)) entityQueue.push(target);
        }
      }
    }
    const entityTraits = ctx.entityTraits.get(currentEntity);
    if (entityTraits) {
      for (const trait2 of entityTraits) {
        removeTrait(ctx, currentEntity, trait2);
      }
    }
    releaseEntity(ctx.entityIndex, currentEntity);
    const allQuery = ctx.queriesHashMap.get("");
    if (allQuery) allQuery.remove(ctx, currentEntity);
    ctx.entityTraits.delete(currentEntity);
    const eid = currentEntity & ENTITY_ID_MASK;
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    for (let i = 0; i < ctx.entityMasks.length; i++) {
      const page = ctx.entityMasks[i][pageId];
      if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
    }
  }
}
function getEntityContext(entity) {
  return universe.pageOwners[(entity & ENTITY_ID_MASK) >>> 10];
}
function entityHas(ctx, entity, trait2) {
  if (!trait2?.[$relationPair]) return hasTrait(ctx, entity, trait2);
  if (!hasTrait(ctx, entity, trait2.relation[$internal].trait)) return false;
  if (trait2.targetQuery) {
    let result_getRelationTargets_8_$f;
    const relationCtx_8_$f = trait2.relation[$internal];
    const traitData_8_$f = ctx.traitInstances[relationCtx_8_$f.trait.id];
    if (!traitData_8_$f || !traitData_8_$f.relationTargets) {
      result_getRelationTargets_8_$f = [];
    } else {
      const eid_8_$f = entity & ENTITY_ID_MASK;
      const p_8_$f = eid_8_$f >>> 10, o_8_$f = eid_8_$f & 1023;
      const page_8_$f = traitData_8_$f.relationTargets[p_8_$f];
      if (!page_8_$f) {
        result_getRelationTargets_8_$f = [];
      } else {
        if (relationCtx_8_$f.exclusive) {
          const target_8_$f = page_8_$f[o_8_$f];
          result_getRelationTargets_8_$f = target_8_$f !== void 0 ? [target_8_$f] : [];
        } else {
          const targets_8_$f = page_8_$f[o_8_$f];
          result_getRelationTargets_8_$f = targets_8_$f !== void 0 ? targets_8_$f.slice() : [];
        }
      }
    }
    const targets = result_getRelationTargets_8_$f;
    return queryInternal(ctx, ...trait2.targetQuery).some((match) => targets.includes(match));
  }
  return hasRelationPair(ctx, entity, trait2);
}

// ../react/src/hooks/use-query.ts
var import_react3 = require("react");
function useQuery(...parameters) {
  const world = useWorld();
  const [, forceUpdate] = (0, import_react3.useReducer)((x) => x + 1, 0);
  const queryRef = (0, import_react3.useMemo)(() => createQuery(...parameters), parameters);
  const cacheRef = (0, import_react3.useRef)(null);
  const getResult = () => {
    const query = world[$internal].queriesHashMap.get(queryRef.hash);
    if (query && cacheRef.current?.hash === queryRef.hash && cacheRef.current.version === query.version) {
      return cacheRef.current.result;
    }
    const result2 = world.query(queryRef).sort();
    const registeredQuery = world[$internal].queriesHashMap.get(queryRef.hash);
    cacheRef.current = {
      hash: queryRef.hash,
      version: registeredQuery.version,
      result: result2
    };
    return result2;
  };
  const result = getResult();
  (0, import_react3.useEffect)(() => {
    const update = () => forceUpdate();
    let unsubAdd = () => {
    };
    let unsubRemove = () => {
    };
    const subscribe = () => {
      unsubAdd = world.onQueryAdd(queryRef, update);
      unsubRemove = world.onQueryRemove(queryRef, update);
      const query = world[$internal].queriesHashMap.get(queryRef.hash);
      if (cacheRef.current && query.version !== cacheRef.current.version) {
        update();
      }
    };
    const handleReset = () => {
      cacheRef.current = null;
      unsubAdd();
      unsubRemove();
      subscribe();
      update();
    };
    subscribe();
    world[$internal].resetSubscriptions.add(handleReset);
    return () => {
      world[$internal].resetSubscriptions.delete(handleReset);
      unsubAdd();
      unsubRemove();
    };
  }, [world, queryRef]);
  return result;
}

// ../react/src/hooks/use-query-first.ts
function useQueryFirst(...parameters) {
  const query = useQuery(...parameters);
  return query[0];
}

// ../react/src/hooks/use-tag.ts
var import_react4 = require("react");

// ../react/src/utils/is-world.ts
function isWorld(target) {
  return typeof target?.spawn === "function";
}

// ../react/src/hooks/use-tag.ts
function useTag(target, tag) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react4.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react4.useMemo)(() => target ? createSubscriptions(target, tag, contextWorld) : void 0, [target, tag, contextWorld]);
  const valueRef = (0, import_react4.useRef)(false);
  const memoRef = (0, import_react4.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(tag) ?? false;
  }
  (0, import_react4.useEffect)(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions(target, tag, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(tag, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(tag, (e) => {
        if (e === entity) setValue(false);
      });
      setValue(entity.has(tag));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-has.ts
var import_react6 = require("react");

// ../react/src/utils/use-stable-pair.ts
var import_react5 = require("react");
function useStableTrait(input) {
  const relation2 = input?.[$relationPair] ? input.relation : input;
  const pairTarget = input?.[$relationPair] ? input.target : void 0;
  return (0, import_react5.useMemo)(() => input, [relation2, pairTarget]);
}

// ../react/src/hooks/use-has.ts
function useHas(target, trait2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react6.useReducer)((x) => x + 1, 0);
  const stableTrait = useStableTrait(trait2);
  const memo = (0, import_react6.useMemo)(() => target ? createSubscriptions2(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  const valueRef = (0, import_react6.useRef)(false);
  const memoRef = (0, import_react6.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ?? false;
  }
  (0, import_react6.useEffect)(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions2(target, trait2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  const isWildcard = !!trait2?.[$relationPair] && trait2.target === "*";
  const wildcardRelation = isWildcard ? trait2.relation : void 0;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(trait2, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(trait2, (e) => {
        if (e !== entity) return;
        if (wildcardRelation) {
          setValue(entity.targetsFor(wildcardRelation).length > 1);
        } else {
          setValue(false);
        }
      });
      setValue(entity.has(trait2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-target.ts
var import_react7 = require("react");
function useTarget(target, relation2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react7.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react7.useMemo)(() => target ? createSubscriptions3(target, relation2, contextWorld) : void 0, [target, relation2, contextWorld]);
  const valueRef = (0, import_react7.useRef)(void 0);
  const memoRef = (0, import_react7.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetFor(relation2);
  }
  (0, import_react7.useEffect)(() => {
    if (!memo) {
      valueRef.current = void 0;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions3(target, relation2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(relation2, (e) => {
        if (e === entity) setValue(entity.targetFor(relation2));
      });
      const onRemoveUnsub = world.onRemove(relation2, (e) => {
        if (e === entity) setValue(void 0);
      });
      const onChangeUnsub = world.onChange(relation2, (e) => {
        if (e === entity) setValue(entity.targetFor(relation2));
      });
      setValue(entity.targetFor(relation2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-targets.ts
var import_react8 = require("react");
function useTargets(target, relation2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react8.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react8.useMemo)(() => target ? createSubscriptions4(target, relation2, contextWorld) : void 0, [target, relation2, contextWorld]);
  const valueRef = (0, import_react8.useRef)([]);
  const memoRef = (0, import_react8.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetsFor(relation2) ?? [];
  }
  (0, import_react8.useEffect)(() => {
    if (!memo) {
      valueRef.current = [];
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions4(target, relation2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      let currentValue = [];
      const update = (value) => {
        currentValue = value;
        setValue(value);
      };
      const onAddUnsub = world.onAdd(relation2, (e) => {
        if (e === entity) update(entity.targetsFor(relation2));
      });
      const onRemoveUnsub = world.onRemove(relation2, (e, t) => {
        if (e === entity) update(currentValue.filter((p) => p !== t));
      });
      const onChangeUnsub = world.onChange(relation2, (e) => {
        if (e === entity) update(entity.targetsFor(relation2));
      });
      update(entity.targetsFor(relation2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait.ts
var import_react9 = require("react");
function useTrait(target, trait2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react9.useReducer)((x) => x + 1, 0);
  const valueRef = (0, import_react9.useRef)(void 0);
  const memoRef = (0, import_react9.useRef)(void 0);
  const stableTrait = useStableTrait(trait2);
  const memo = (0, import_react9.useMemo)(() => target ? createSubscriptions5(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ? memo.entity.get(stableTrait) : void 0;
  }
  (0, import_react9.useEffect)(() => {
    if (!memo) return;
    let initialized = false;
    const unsub = memo.subscribe((value) => {
      if (!initialized) {
        initialized = true;
        if (shallowEqual(value, valueRef.current)) return;
      }
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsub();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions5(target, trait2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onChangeUnsub = world.onChange(trait2, (e) => {
        if (e === entity) setValue(e.get(trait2));
      });
      const onAddUnsub = world.onAdd(trait2, (e) => {
        if (e === entity) setValue(e.get(trait2));
      });
      const onRemoveUnsub = world.onRemove(trait2, (e) => {
        if (e === entity) setValue(void 0);
      });
      setValue(entity.has(trait2) ? entity.get(trait2) : void 0);
      return () => {
        onChangeUnsub();
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait-effect.ts
var import_react10 = require("react");
function useTraitEffect(target, trait2, callback) {
  const contextWorld = useWorld();
  const world = (0, import_react10.useMemo)(() => isWorld(target) ? target : contextWorld, [target, contextWorld]);
  const entity = (0, import_react10.useMemo)(() => isWorld(target) ? target[$internal].worldEntity : target, [target]);
  const stableTrait = useStableTrait(trait2);
  const callbackRef = (0, import_react10.useRef)(callback);
  callbackRef.current = callback;
  (0, import_react10.useEffect)(() => {
    const onChangeUnsub = world.onChange(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onAddUnsub = world.onAdd(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onRemoveUnsub = world.onRemove(stableTrait, (e) => {
      if (e === entity) callbackRef.current(void 0);
    });
    callbackRef.current(entity.has(stableTrait) ? entity.get(stableTrait) : void 0);
    return () => {
      onChangeUnsub();
      onAddUnsub();
      onRemoveUnsub();
    };
  }, [stableTrait, world, entity]);
}

// ../react/src/world/world-provider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function WorldProvider({
  children,
  world
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorldContext.Provider, { value: world, children });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WorldProvider,
  useActions,
  useHas,
  useQuery,
  useQueryFirst,
  useTag,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
  useWorld
});
