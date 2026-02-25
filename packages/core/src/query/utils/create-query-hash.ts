import { isPairPattern } from '../../trait/utils/is-relation';
import type { Trait } from '../../trait/types';
import { isModifier } from '../modifier';
import type { QueryHash, QueryParameter } from '../types';

const ids: number[] = [];

export const createQueryHash = (parameters: QueryParameter[]): QueryHash => {
    let cursor = 0;

    for (let i = 0; i < parameters.length; i++) {
        const param = parameters[i];

        if (isPairPattern(param)) {
            const [relation, target] = param;
            const relationId = (relation as unknown as Trait).id;
            const targetId = typeof target === 'number' ? target : -1;
            ids[cursor++] = relationId * 10000000 + targetId + 5000000;
        } else if (isModifier(param)) {
            const modifierId = param.id;
            const traitIds = param.traitIds;
            for (let j = 0; j < traitIds.length; j++) {
                ids[cursor++] = modifierId * 100000 + traitIds[j];
            }
        } else {
            ids[cursor++] = (param as Trait).id;
        }
    }

    // Insertion sort — optimal for small arrays (typically 1-7 elements)
    for (let i = 1; i < cursor; i++) {
        const key = ids[i];
        let j = i - 1;
        while (j >= 0 && ids[j] > key) {
            ids[j + 1] = ids[j];
            j--;
        }
        ids[j + 1] = key;
    }

    // Build string key without join() — avoids intermediate array allocation
    if (cursor === 0) return '';
    let hash = '' + ids[0];
    for (let i = 1; i < cursor; i++) {
        hash += ',' + ids[i];
    }

    return hash;
};
