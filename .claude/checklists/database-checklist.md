# Database Checklist

## Migrations
- [ ] Migration files use timestamp naming
- [ ] Migration tested on test database
- [ ] Down migration provided
- [ ] Migration is idempotent
- [ ] Foreign keys defined

## Queries
- [ ] All queries use parameterized statements
- [ ] No string concatenation for SQL
- [ ] Queries have appropriate indexes
- [ ] N+1 queries avoided

## Transactions
- [ ] Multi-statement operations use transactions
- [ ] Transactions have appropriate isolation level
- [ ] Transaction timeout configured
- [ ] Deadlock handling implemented

## Performance
- [ ] Indexes created for foreign keys
- [ ] Indexes created for WHERE clauses
- [ ] Index usage verified with EXPLAIN
- [ ] Query performance tested with realistic data

## Data Integrity
- [ ] Foreign key constraints defined
- [ ] NOT NULL constraints where appropriate
- [ ] CHECK constraints for validation
- [ ] Unique constraints where needed