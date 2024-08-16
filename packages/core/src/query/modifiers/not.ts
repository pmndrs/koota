import { modifier } from '../modifier';

export const Not = modifier('not', 1, (world, ...components) => components);
