import {
	assignmentExpression,
	conditionalExpression,
	Expression,
	identifier,
	isBlockStatement,
	isExpressionStatement,
	isIdentifier,
	isIfStatement,
	isReturnStatement,
	isVariableDeclaration,
	numericLiteral,
	sequenceExpression,
	Statement,
	unaryExpression,
} from '@babel/types';

export function convertStatementToExpression(
	statement: Statement,
	resultName: string,
	suffix: string,
	localVars: Set<string>
): Expression {
	const rest = [resultName, suffix, localVars] as [string, string, Set<string>];

	// If it's already an ExpressionStatement, return its expression
	if (isExpressionStatement(statement)) {
		return statement.expression;
	}

	// For blocks, convert to sequence expression
	if (isBlockStatement(statement)) {
		return sequenceExpression(
			statement.body.map((stmt) => convertStatementToExpression(stmt, ...rest))
		);
	}

	// For if statements, convert to conditional expression
	if (isIfStatement(statement)) {
		return conditionalExpression(
			statement.test,
			convertStatementToExpression(statement.consequent, ...rest),
			statement.alternate
				? convertStatementToExpression(statement.alternate, ...rest)
				: identifier('undefined')
		);
	}

	if (isReturnStatement(statement)) {
		let argument = statement.argument;

		if (isIdentifier(argument) && localVars.has(argument.name)) {
			argument = identifier(argument.name + suffix);
		}

		return sequenceExpression([
			assignmentExpression('=', identifier(resultName), argument || identifier('undefined')),
		]);
	}

	if (isVariableDeclaration(statement)) {
		return sequenceExpression(
			statement.declarations.map((declaration) => {
				let id = declaration.id;

				if (isIdentifier(declaration.id) && localVars.has(declaration.id.name)) {
					id = identifier(declaration.id.name + suffix);
				}

				return assignmentExpression(
					'=',
					id,
					declaration.init || identifier('undeficonstned')
				);
			})
		);
	}

	// Default case - wrap in void operator if we can't convert
	return unaryExpression('void', numericLiteral(0));
}
