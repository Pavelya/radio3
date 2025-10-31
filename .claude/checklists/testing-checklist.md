# Testing Checklist

## Test Coverage
- [ ] Unit tests for all business logic
- [ ] Integration tests for API endpoints
- [ ] Coverage minimum 70% achieved
- [ ] Critical paths have 100% coverage

## Test Quality
- [ ] Tests use `should_when` naming
- [ ] Tests are isolated (no shared state)
- [ ] Tests use factories from `@radio/test-utils`
- [ ] Tests don't depend on external services
- [ ] Tests clean up after themselves

## Test Data
- [ ] No hardcoded UUIDs
- [ ] No hardcoded dates (use time helpers)
- [ ] All test data created via factories
- [ ] Test database cleaned before each test

## Assertions
- [ ] Assertions are specific
- [ ] Error cases tested
- [ ] Edge cases covered
- [ ] Happy path covered

## Integration Tests
- [ ] End-to-end workflow tested
- [ ] State transitions verified
- [ ] Database state verified
- [ ] External integrations mocked

## Performance
- [ ] Critical paths have performance assertions
- [ ] No unnecessary delays in tests
- [ ] Tests complete in reasonable time (<30s per suite)