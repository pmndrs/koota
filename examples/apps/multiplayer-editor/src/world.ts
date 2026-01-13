import { createWorld } from 'koota';
import { EditorStatus, Time } from './traits';

export const world = createWorld(Time, EditorStatus);
