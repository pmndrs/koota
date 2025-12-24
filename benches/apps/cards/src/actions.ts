import { createActions, type Entity, type TraitRecord } from 'koota';
import { Card, IsHand, OrderedCards, Position, Velocity } from './traits';

export const actions = createActions((world) => ({
	spawnHand: () => {
		return world.spawn(IsHand, OrderedCards);
	},
	spawnCard: (hand: Entity, config: TraitRecord<typeof Card>) => {
		const card = world.spawn(Card(config), Position, Velocity);

		// Add card to hand's ordered list
		const cards = hand.get(OrderedCards);
		// Use the ordered list to add the card to the hand.
		//  The HeldBy relation is automatically added to the card.
		if (cards) cards.push(card);
		return card;
	},
}));
