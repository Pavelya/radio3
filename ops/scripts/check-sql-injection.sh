#!/bin/bash
set -e

FOUND=0

# Check for string concatenation in SQL
# Dangerous patterns: query(` ... ${var} ... `) or query('...' + var + '...')
if grep -r -n \
  -E "(query|execute)\s*\(\s*[\`'\"].*\$\{|query\s*\(\s*.*\s*\+\s*" \
  --include="*.ts" \
  --include="*.js" \
  --include="*.py" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  . 2>/dev/null; then
  FOUND=1
fi

exit $FOUND
```

### Configuration Files

**File: `ops/config/hardcoded-patterns.txt`**
```
# API Keys and Secrets
sk-[a-zA-Z0-9]{32,}
api[_-]?key\s*[:=]\s*["'][^"']+["']
secret[_-]?key\s*[:=]\s*["'][^"']+["']

# Passwords
password\s*[:=]\s*["'][^"']{8,}["']

# Database Connection Strings
postgres://[^:]+:[^@]+@
mysql://[^:]+:[^@]+@
mongodb(\+srv)?://[^:]+:[^@]+@

# AWS Keys
AKIA[0-9A-Z]{16}
aws[_-]?secret[_-]?access[_-]?key

# JWT Secrets
jwt[_-]?secret\s*[:=]\s*["'][^"']+["']

# Bearer Tokens
Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*

# Private Keys
-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----
```

**File: `ops/config/forbidden-patterns.txt`**
```
# Console statements
console\.log
console\.error
console\.warn
console\.debug

# Dangerous functions
eval\(
exec\(
Function\(

# XSS risks
innerHTML\s*=
outerHTML\s*=

# Debugging
debugger;