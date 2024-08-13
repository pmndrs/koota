import { useContext } from 'react';
import { EntityContext } from './entity-context';

export function useEntity() {
	return useContext(EntityContext);
}
