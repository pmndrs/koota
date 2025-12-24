import { createActions, type Entity, type TraitRecord } from 'koota';
import { Card, IsHand, OrderedCards, Position, Velocity } from './traits';

type CardData = TraitRecord<typeof Card>;

export const actions = createActions((world) => ({
	spawnHand: () => {
		return world.spawn(IsHand, OrderedCards);
	},
	spawnCard: (hand: Entity, cardData: CardData) => {
		const card = world.spawn(Card(cardData), Position, Velocity);

		// Add card to hand's ordered list
		const cards = hand.get(OrderedCards);
		if (cards) {
			cards.push(card);
		}

		return card;
	},
}));
