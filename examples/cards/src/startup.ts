import { useActions } from 'koota/react';
import { useEffect } from 'react';
import { actions } from './actions';

export function Startup() {
    const { spawnHand, spawnCard } = useActions(actions);

    useEffect(() => {
        const hand = spawnHand();

        // Spawn some sample cards
        const sampleCards = [
            { name: 'Fireball', cost: 4, description: 'Deal 6 damage' },
            { name: 'Ice Lance', cost: 1, description: 'Deal 2 damage' },
            { name: 'Polymorph', cost: 4, description: 'Transform a minion' },
            { name: 'Arcane Intellect', cost: 3, description: 'Draw 2 cards' },
            { name: 'Frostbolt', cost: 2, description: 'Deal 3 damage and freeze' },
            { name: 'Mirror Image', cost: 1, description: 'Summon two 0/2 minions' },
            { name: 'Flamestrike', cost: 7, description: 'Deal 4 damage to all enemies' },
        ];

        sampleCards.forEach((cardData) => {
            spawnCard(hand, cardData);
        });

        return () => {
            hand?.destroy();
        };
    }, [spawnHand, spawnCard]);

    return null;
}
