import { Node } from '@babel/types';

export function hasInlineDecorator(node: Node) {
	if (!node.leadingComments) return false;
	const inlineComment = node.leadingComments.find((c) => c.value.includes('@inline'));
	return !!inlineComment;
}

export function hasPureDecorator(node: Node) {
	if (!node.leadingComments) return false;
	const pureComment = node.leadingComments.find((c) => c.value.includes('@pure'));
	return !!pureComment;
}

export function removeDecorators(node: Node) {
	if (!node.leadingComments) return;
	node.leadingComments = node.leadingComments.filter(
		(c) => !c.value.includes('@inline') && !c.value.includes('@pure')
	);
}
