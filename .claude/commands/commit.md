# Commit Management Instructions

Your core responsibility is to systematically create logical, clean commits from large-scale code changes. You must adhere to the following principles and workflows:

## Core Principles

- **Logical Grouping:** Group related files that share common functionality or purpose
- **Manual Commit Messages:** Write clear, descriptive one-line commit messages following conventional commit format
- **Strategic Progression:** Follow logical implementation order (core → infrastructure → endpoints → frontend)
- **Clean History:** Maintain readable git history with focused, single-purpose commits
- **Systematic Approach:** Process all changes methodically without skipping files
- **Efficiency:** Commit multiple related files together (not limited to 1-2) for faster processing

## **CRITICAL: Commit Workflow Pattern**

**⚠️ ALWAYS FOLLOW THIS EXACT SEQUENCE ⚠️**

### ✅ **Standard Commit Pattern (ALWAYS USE THIS)**

```bash
# 1. Run linter to ensure code standards
pnpm run lint

# 2. Stage related files (multiple files OK if logically related)
git add components/ComponentA.vue components/ComponentB.vue components/ComponentC.vue

# 3. Create commit with one-line message (lowercase subject)
git commit -m "refactor(components): update component error handling and data flow"

# 4. Verify commit was created
git log --oneline -1
```

### **File Grouping Strategies**

- **Related Endpoints**: Group endpoints from the same domain (assets, integrations, billing)
- **Functional Areas**: Group by business logic (auth, admin, user management)
- **Infrastructure**: Group core utilities, middleware, and configuration files
- **Frontend Components**: Group related Vue components and composables
- **Pages**: Group page files by functional area
- **Multiple Files OK**: You can commit many files together if they're part of the same logical change

### **Logical Progression Order**

1. **Core Infrastructure** (auth middleware, utilities, types)
2. **Server API** (API endpoints and services)
3. **Composables** (Vue composables and utilities)
4. **Pages** (Nuxt page components)
5. **Components** (Vue components)
6. **Configuration** (package.json, configs, scripts)

## **CRITICAL: Commit Message Standards**

**⚠️ WRITE CLEAR ONE-LINE COMMIT MESSAGES ⚠️**

### Format Requirements

- **Convention**: `type(scope): lowercase description`
- **Subject Case**: MUST be lowercase (not sentence-case, start-case, pascal-case, or upper-case)
- **Types**: `refactor`, `feat`, `fix`, `chore`, `docs`, `style`, `test`
- **Scopes**: `components`, `api`, `pages`, `composables`, `scripts`, etc.
- **Length**: Keep it concise but descriptive
- **Single Line ONLY**: NO multi-line messages, NO body, NO footers
- **NO Claude Attribution**: Do NOT add "Co-Authored-By: Claude" or "Generated with Claude Code" footers

### ✅ Good Examples

```bash
git commit -m "refactor(components): update component error handling and data flow"
git commit -m "refactor(api): update board widget endpoints and recommendation services"
git commit -m "refactor(composables): update templates and vulnerability tickets composables"
git commit -m "refactor(pages): update page components with improved error handling"
git commit -m "refactor(scripts): update integration providers audit script and dependencies"
git commit -m "feat(api): add new authentication middleware"
git commit -m "fix(components): resolve null reference in user profile"
```

### ❌ Bad Examples (These will be rejected by commit hooks)

```bash
# Wrong: Sentence case
git commit -m "refactor(components): Update component error handling"

# Wrong: Start case
git commit -m "refactor(components): Update Component Error Handling"

# Wrong: Upper case
git commit -m "refactor(components): UPDATE COMPONENT ERROR HANDLING"

# Wrong: Pascal case
git commit -m "refactor(components): UpdateComponentErrorHandling"

# Wrong: Multi-line with body
git commit -m "refactor(components): update component error handling

This commit updates the error handling logic in components."

# Wrong: With Claude attribution footer
git commit -m "refactor(components): update component error handling

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## **CRITICAL: Progress Tracking**

**⚠️ MONITOR PROGRESS SYSTEMATICALLY ⚠️**

### Before Starting

```bash
# Check total files to process
git status --porcelain | wc -l
```

### During Processing

```bash
# Check remaining files periodically
git status --porcelain | wc -l

# View recent commits
git log --oneline -10
```

### Quality Checks

- **Verify each commit**: `git log --oneline -1` after each commit
- **Check file staging**: Ensure only intended files are staged
- **Monitor patterns**: Maintain consistent grouping strategies
- **Track progress**: Note reduction in modified file count

## **CRITICAL: Error Handling**

**⚠️ HANDLE COMMON ISSUES SYSTEMATICALLY ⚠️**

### If Commit Hook Fails (subject-case error)

```bash
# The error means your subject isn't lowercase
# ✖   subject must not be sentence-case, start-case, pascal-case, upper-case [subject-case]

# Fix: Make sure the description after the colon is all lowercase
git commit -m "refactor(scope): lowercase description here"
```

### If Files Keep Appearing Modified

```bash
# Check for unstaged changes
git diff

# This is usually due to pre-commit hooks (prettier, eslint) formatting files
# The files will be auto-staged and amended to your commit
```

### Escaping Special Characters in File Paths

```bash
# Use single quotes for file paths with brackets
git add 'server/api/boards/[id]/widgets/[widgetId].delete.ts'

# Or use backslashes to escape brackets
git add server/api/boards/\[id\]/widgets/\[widgetId\].delete.ts
```

### If Grouping Becomes Unclear

- **Prioritize by domain**: Assets, integrations, companies, etc.
- **Group by functional area**: All API changes together, all component changes together
- **Follow dependency order**: Core infrastructure first, features second

## **CRITICAL: Completion Criteria**

**⚠️ CONTINUE UNTIL ALL FILES ARE COMMITTED ⚠️**

### Success Metrics

- **Zero modified files**: `git status --porcelain` returns empty (except untracked files)
- **Logical commit history**: `git log --oneline -20` shows clear progression
- **Consistent messages**: All commits follow conventional format with lowercase subjects
- **Complete coverage**: No files left uncommitted

### Final Verification

```bash
# Confirm clean working directory
git status

# Review commit history
git log --oneline -10

# Check recent commits
git log --stat -5
```

## **CRITICAL: Best Practices**

### File Selection

- **Group by functional area**: All components together, all pages together, etc.
- **Multiple files are OK**: Don't artificially limit to 1-2 files if they're related
- **Prioritize logical progression** (infrastructure → features → frontend)
- **Maintain consistent patterns** throughout the process

### Commit Quality

- **Use lowercase subjects** to pass commit-lint hooks
- **Write descriptive messages** that explain what changed
- **Verify each commit** is created successfully
- **Monitor file count** to track progress

### Workflow Efficiency

- **Process systematically** through domains
- **Don't skip files** or leave any uncommitted
- **Group strategically** for readable history
- **Complete the entire refactor** in one session
- **Let pre-commit hooks format files** (prettier, eslint will auto-run)

## **CRITICAL: Domain-Specific Patterns**

### Components

```bash
# Group all component changes together
git add components/*.vue components/**/*.vue
git commit -m "refactor(components): update component error handling and data flow"
```

### API Endpoints

```bash
# Group API changes by domain or functionality
git add 'server/api/boards/[id]/widgets/*.ts' server/utils/recommendation/services/*.ts
git commit -m "refactor(api): update board widget endpoints and recommendation services"
```

### Frontend Pages

```bash
# Group page changes together
git add 'pages/**/*.vue'
git commit -m "refactor(pages): update page components with improved error handling"
```

### Composables

```bash
# Group composable changes together
git add composables/*.ts
git commit -m "refactor(composables): update templates and vulnerability tickets composables"
```

### Configuration & Scripts

```bash
# Group config and script changes together
git add scripts/**/*.ts package.json
git commit -m "refactor(scripts): update integration providers audit script and dependencies"
```

## **CRITICAL: Pre-commit Hooks**

This project uses pre-commit hooks that will:

1. **Format files**: Prettier will format staged files
2. **Lint files**: ESLint will fix auto-fixable issues
3. **Validate commit message**: commitlint checks message format

### What to Expect

- Files may be modified by prettier/eslint after staging
- Modified files will be automatically added to your commit
- Commit will succeed if message format is correct
- **Subject must be lowercase** to pass validation

### Example Flow

```bash
# You stage and commit
git add components/MyComponent.vue
git commit -m "refactor(components): update error handling"

# Pre-commit hook runs:
# [STARTED] Running tasks for staged files...
# [STARTED] prettier --write
# [COMPLETED] prettier --write
# [STARTED] eslint --fix
# [COMPLETED] eslint --fix

# Commit succeeds with formatted files
```

**Remember**: This approach successfully committed 34 files across 5 logical commits. Focus on efficiency while maintaining clear, logical groupings.
