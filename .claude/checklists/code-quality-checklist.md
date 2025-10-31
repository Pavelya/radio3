# Code Quality Checklist

## Type Safety
- [ ] All types imported from `@radio/core`
- [ ] No `any` types used
- [ ] TypeScript strict mode passes
- [ ] All function parameters typed
- [ ] All return types specified

## Code Structure
- [ ] Functions max 50 lines
- [ ] Files max 300 lines
- [ ] No code duplication (DRY)
- [ ] Clear separation of concerns
- [ ] Single responsibility principle

## Naming
- [ ] Variables have descriptive names
- [ ] Functions named with verbs
- [ ] Boolean variables prefixed with is/has/should
- [ ] Constants in UPPER_SNAKE_CASE
- [ ] Files use kebab-case

## Documentation
- [ ] All exported functions have JSDoc
- [ ] Complex logic has inline comments
- [ ] README updated if public API changed
- [ ] CHANGELOG.md updated

## Error Handling
- [ ] All errors use error classes from `@radio/core`
- [ ] Try-catch blocks have specific error types
- [ ] Errors include helpful context
- [ ] No swallowed errors (empty catch blocks)

## Logging
- [ ] All logs use shared logger
- [ ] No console.log statements
- [ ] Log messages are descriptive
- [ ] Sensitive data not logged
- [ ] Appropriate log levels used

## Dependencies
- [ ] No unnecessary dependencies added
- [ ] All dependencies in correct package.json section
- [ ] Dependency versions pinned

## Code Smells
- [ ] No magic numbers (use named constants)
- [ ] No commented-out code
- [ ] No debug statements left in
- [ ] No TODOs without GitHub issues