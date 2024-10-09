import { Component } from '../../component/types';
import { ModifierData } from '../modifier';

export const Or = <T extends Component[] = Component[]>(...components: T) =>
	new ModifierData('or', 2, components);
