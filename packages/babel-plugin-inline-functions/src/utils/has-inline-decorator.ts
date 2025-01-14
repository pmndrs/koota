import { Node } from '@babel/types';

export function hasInlineDecorator(node: Node) {
	if (!node.leadingComments) return false;
	const inlineComment = node.leadingComments.find((c) => c.value.includes('@inline'));
	return !!inlineComment;
}
