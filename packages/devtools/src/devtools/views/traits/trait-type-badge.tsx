import type { TraitType } from '../../model/trait-info';
import { Badge, type BadgeTone } from '../../ui/badge';

// Each storage type borrows the syntax role it resembles: tags read like class
// names, SoA like storage keywords, AoS like object types, relations like properties.
const TONES: Record<TraitType, BadgeTone> = {
  tag: 'blue',
  soa: 'teal',
  aos: 'peach',
  rel: 'lavender',
};

/** The colored label for a trait's storage type, the same everywhere a trait is listed. */
export function TraitTypeBadge({ type, size }: { type: TraitType; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={TONES[type]} size={size}>
      {type}
    </Badge>
  );
}
