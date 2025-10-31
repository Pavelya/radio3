# Security Checklist

Run this checklist before marking any task complete.

## Pre-Commit Security Checks

### Credentials Scan
- [ ] No API keys in code (`grep -r "sk-" --exclude-dir=node_modules`)
- [ ] No passwords in code (`grep -r 'password.*=.*["'\'']' --exclude-dir=node_modules`)
- [ ] All secrets in .env.example documented
- [ ] No connection strings hardcoded
- [ ] No AWS keys in code

### Input Validation
- [ ] All external inputs validated with Zod schemas
- [ ] All API endpoints use schema validation middleware
- [ ] All user-provided file paths validated
- [ ] File upload size limits enforced
- [ ] File type validation in place

### Database Security
- [ ] All queries use parameterized statements
- [ ] No dynamic SQL string concatenation
- [ ] Connection string uses SSL (if production)
- [ ] Database user has minimum required permissions

### Dependency Security
- [ ] Run `pnpm audit` (no high/critical vulnerabilities)
- [ ] All new dependencies justified in PR description
- [ ] Dependencies come from trusted sources

## Runtime Security

### Authentication
- [ ] API endpoints require authentication where appropriate
- [ ] JWT tokens validated on every request
- [ ] Token expiration implemented
- [ ] Refresh token rotation implemented

### Authorization
- [ ] RBAC checked before sensitive operations
- [ ] User permissions verified in database
- [ ] No elevation of privileges without re-authentication

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] Sensitive data encrypted in transit (HTTPS)
- [ ] No sensitive data in logs
- [ ] PII handled according to GDPR requirements

## Error Handling

### Information Disclosure
- [ ] Error messages don't expose system internals
- [ ] Stack traces not sent to client
- [ ] Database errors sanitized

---

## IF ANY ITEM FAILS:
1. Fix the issue immediately
2. Re-run the full checklist
3. Document the fix in commit message
4. Add test to prevent regression