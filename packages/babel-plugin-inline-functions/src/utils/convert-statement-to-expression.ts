import {
	conditionalExpression,
	Expression,
	identifier,
	numericLiteral,
	sequenceExpression,
	Statement,
	unaryExpression,
} from '@babel/types';

export function convertStatementToExpression(statement: Statement): Expression {
	// If it's already an ExpressionStatement, return its expression
	if (statement.type === 'ExpressionStatement') {
		return statement.expression;
	}

	// For blocks, convert to sequence expression
	if (statement.type === 'BlockStatement') {
		return sequenceExpression(statement.body.map((stmt) => convertStatementToExpression(stmt)));
	}

	// For if statements, convert to conditional expression
	if (statement.type === 'IfStatement') {
		return conditionalExpression(
			statement.test,
			convertStatementToExpression(statement.consequent),
			statement.alternate
				? convertStatementToExpression(statement.alternate)
				: identifier('undefined')
		);
	}

	// Default case - wrap in void operator if we can't convert
	return unaryExpression('void', numericLiteral(0));
}
