#!/usr/bin/env bash
#
# TypeScript Project Setup Validator
#
# Checks that TypeScript project is properly configured for development.
# Run before starting development or deploying.
#
# Usage: ./validate-setup.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ((ERRORS++)); }
warn() { echo -e "${YELLOW}!${NC} $1"; ((WARNINGS++)); }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

echo "=========================================="
echo "TypeScript Project Setup Validator"
echo "=========================================="
echo ""

# Check 1: Node.js version
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    if [[ $MAJOR_VERSION -ge 20 ]]; then
        pass "Node.js $NODE_VERSION (recommended: 20+)"
    else
        warn "Node.js $NODE_VERSION (recommended: 20+ for full ES2024 support)"
    fi
else
    fail "Node.js not found"
fi

# Check 2: Package manager
echo ""
echo "Checking package manager..."
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v)
    pass "pnpm $PNPM_VERSION installed (recommended)"
elif command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    warn "npm $NPM_VERSION installed (pnpm recommended for better performance)"
else
    fail "No package manager found"
fi

# Check 3: TypeScript installation
echo ""
echo "Checking TypeScript..."
if [[ -f "node_modules/typescript/package.json" ]]; then
    TS_VERSION=$(node -p "require('./node_modules/typescript/package.json').version")
    MAJOR_VERSION=$(echo $TS_VERSION | cut -d. -f1)
    MINOR_VERSION=$(echo $TS_VERSION | cut -d. -f2)
    if [[ $MAJOR_VERSION -ge 5 ]] && [[ $MINOR_VERSION -ge 5 ]]; then
        pass "TypeScript $TS_VERSION installed"
    else
        warn "TypeScript $TS_VERSION installed (5.5+ recommended)"
    fi
elif command -v tsc &> /dev/null; then
    TS_VERSION=$(tsc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    pass "TypeScript $TS_VERSION (global)"
else
    fail "TypeScript not found"
fi

# Check 4: tsconfig.json
echo ""
echo "Checking TypeScript configuration..."
if [[ -f "tsconfig.json" ]]; then
    pass "tsconfig.json exists"

    # Check for strict mode
    if grep -q '"strict":\s*true' tsconfig.json 2>/dev/null; then
        pass "Strict mode enabled"
    else
        warn "Strict mode not enabled (recommended)"
    fi

    # Check for target
    if grep -qE '"target":\s*"ES202[234]"' tsconfig.json 2>/dev/null; then
        pass "Modern ES target configured"
    else
        info "Consider updating target to ES2024"
    fi
else
    fail "tsconfig.json not found"
fi

# Check 5: package.json type field
echo ""
echo "Checking ESM configuration..."
if [[ -f "package.json" ]]; then
    if grep -q '"type":\s*"module"' package.json 2>/dev/null; then
        pass "ESM mode enabled (type: module)"
    else
        info "Consider adding \"type\": \"module\" for ESM"
    fi
else
    fail "package.json not found"
fi

# Check 6: ESLint configuration
echo ""
echo "Checking linting setup..."
if [[ -f "eslint.config.js" ]] || [[ -f "eslint.config.mjs" ]]; then
    pass "ESLint flat config found"
elif [[ -f ".eslintrc.js" ]] || [[ -f ".eslintrc.json" ]]; then
    warn "Legacy ESLint config found (migrate to flat config for ESLint 9+)"
else
    warn "ESLint not configured"
fi

# Check 7: Prettier configuration
echo ""
echo "Checking formatting setup..."
if [[ -f ".prettierrc" ]] || [[ -f ".prettierrc.json" ]] || [[ -f "prettier.config.js" ]]; then
    pass "Prettier configured"
else
    info "Consider adding Prettier for consistent formatting"
fi

# Check 8: Test framework
echo ""
echo "Checking test setup..."
if [[ -f "vitest.config.ts" ]] || [[ -f "vitest.config.js" ]]; then
    pass "Vitest configured"
elif [[ -f "jest.config.ts" ]] || [[ -f "jest.config.js" ]]; then
    pass "Jest configured"
elif grep -q '"vitest"' package.json 2>/dev/null; then
    pass "Vitest in dependencies"
elif grep -q '"jest"' package.json 2>/dev/null; then
    pass "Jest in dependencies"
else
    warn "No test framework detected"
fi

# Check 9: Git hooks (optional)
echo ""
echo "Checking Git hooks..."
if [[ -d ".husky" ]]; then
    pass "Husky Git hooks configured"
elif [[ -f ".git/hooks/pre-commit" ]]; then
    pass "Git pre-commit hook exists"
else
    info "Consider adding pre-commit hooks for quality checks"
fi

# Check 10: Dependencies up to date
echo ""
echo "Checking for outdated packages..."
if command -v pnpm &> /dev/null && [[ -f "pnpm-lock.yaml" ]]; then
    OUTDATED=$(pnpm outdated --format json 2>/dev/null | grep -c '"' || echo "0")
    if [[ "$OUTDATED" == "0" ]] || [[ "$OUTDATED" == "" ]]; then
        pass "All packages up to date"
    else
        info "Some packages may be outdated (run: pnpm outdated)"
    fi
elif command -v npm &> /dev/null && [[ -f "package-lock.json" ]]; then
    info "Run 'npm outdated' to check for updates"
fi

# Summary
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
if [[ $ERRORS -eq 0 ]] && [[ $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "Your TypeScript project is properly configured."
    exit 0
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}Passed with $WARNINGS warning(s)${NC}"
    echo "Project is functional but could be improved."
    exit 0
else
    echo -e "${RED}Failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo "Fix errors before proceeding."
    exit 1
fi
