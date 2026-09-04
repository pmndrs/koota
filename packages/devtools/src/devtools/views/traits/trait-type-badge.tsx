import type { TraitType } from '../../model/trait-info';
import { Badge, type BadgeTone } from '../../ui/badge';

// Tags take poimandres' markup tag mint and relations its pink. SoA takes the
// Cursor number gold for its columns of values, AoS the Cursor property lavender.
const TONES: Record<TraitType, BadgeTone> = {
  tag: 'mint',
  soa: 'gold',
  aos: 'lavender',
  rel: 'pink',
};

/** The colored label for a trait's storage type, the same everywhere a trait is listed. */
export function TraitTypeBadge({ type, size }: { type: TraitType; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={TONES[type]} size={size}>
      {type}
    </Badge>
  );
}
