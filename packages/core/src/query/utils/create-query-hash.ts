import { $internal } from '../../common';
import type { Relation } from '../../relation/types';
import { isRelationPair } from '../../relation/utils/is-relation';
import type { Trait } from '../../trait/types';
import { isModifier } from '../modifier';
import { isQuery } from './is-query';
import type { QueryHash, QueryParameter } from '../types';

export const createQueryHash = (parameters: QueryParameter[]): QueryHash => {
    const parts: string[] = [];

    for (let i = 0; i < parameters.length; i++) {
        const param = parameters[i];

        if (isRelationPair(param)) {
            const relationId = (param.relation as Relation<Trait>)[$internal].trait.id;

            if (param.targetQuery) {
                const targetHash = isQuery(param.targetQuery)
                    ? param.targetQuery.hash
                    : createQueryHash([...param.targetQuery]);
                parts.push(`r:${relationId}:q:${targetHash}`);
                continue;
            }

            const target = param.target;
            parts.push(target === '*' ? `r:${relationId}:*` : `r:${relationId}:e:${target}`);
            continue;
        }

        if (isModifier(param)) {
            for (let j = 0; j < param.traitIds.length; j++) {
                parts.push(`m:${param.id}:${param.traitIds[j]}`);
            }
            continue;
        }

        parts.push(`t:${(param as Trait).id}`);
    }

    parts.sort();
    return parts.join(',');
};
