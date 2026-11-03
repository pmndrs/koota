import { $internal } from '../common';
import { relation } from './relation';

/**
 * The subject of an event. Emit attaches it, so a row that holds it is an event, and adding it
 * to an alive entity ends the entity as an event with the data it holds. A query that does not
 * name it never sees an event row.
 */
export const On = relation({ exclusive: true });
On[$internal].reserved = true;
