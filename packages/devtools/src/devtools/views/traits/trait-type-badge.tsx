import type { TraitType } from '../../model/trait-info';
import { Badge, type BadgeTone } from '../../ui/badge';

// Each storage type borrows the syntax role it resembles: tags are markup tags,
// SoA is a storage type, AoS is a class, and relations take the theme's pink.
const TONES: Record<TraitType, BadgeTone> = {
  tag: 'mint',
  soa: 'steel',
  aos: 'sky',
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
