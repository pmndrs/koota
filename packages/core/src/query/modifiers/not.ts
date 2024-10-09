import { Component } from '../../component/types';
import { ModifierData } from '../modifier';

export const Not = <T extends Component[] = Component[]>(...components: T) =>
	new ModifierData('not', 1, components);
