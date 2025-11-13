# AI Radio 2525 - Command Cheat Sheet

Quick reference for common operations.

## Startup & Shutdown

```bash
# Start everything (automated)
./ops/start-all.sh

# Check status
./ops/status.sh

# Stop everything
./ops/stop-all.sh
```

## Service URLs

```bash
# Web Interfaces
http://localhost:3000          # Public Player
http://localhost:3001          # Admin Dashboard

# Streaming
http://localhost:8001/radio.opus   # Primary stream (Opus)
http://localhost:8001/radio.mp3    # Fallback stream (MP3)
http://localhost:8001/status.xsl   # Icecast status page
http://localhost:8001/admin/       # Icecast admin (admin/admin)

# Backend
http://localhost:8000          # API Server
http://localhost:8000/health   # API health check
http://localhost:5002          # Piper TTS service
```

## Start Individual Services

```bash
# Docker Services
docker compose up -d piper-tts                    # Start Piper TTS
cd apps/playout && docker compose up -d           # Start Icecast + Liquidsoap

# API & Web
pnpm --filter @radio/api dev                      # API Server
pnpm --filter @radio/admin dev                    # Admin Dashboard
pnpm --filter @radio/web dev                      # Public Player

# Workers
pnpm --filter @radio/scheduler-worker start       # Scheduler
pnpm --filter @radio/segment-gen-worker start     # Segment Generation
pnpm --filter @radio/embedder-worker start        # Embedder
pnpm --filter @radio/mastering-worker start       # Mastering
```

## Stop Individual Services

```bash
# Docker
docker stop radio-piper-tts
docker stop radio-icecast
docker stop radio-liquidsoap

# Node processes
pkill -f "scheduler-worker"
pkill -f "segment-gen-worker"
pkill -f "embedder-worker"
pkill -f "mastering-worker"

# Stop all pnpm processes
pkill -f "pnpm.*dev"
```

## Monitoring

```bash
# Service Status
./ops/status.sh

# Running processes
ps aux | grep -E "pnpm|node.*dist" | grep -v grep

# Docker containers
docker ps

# Port usage
lsof -i :3000,3001,8000,8001,5002

# Network listeners
netstat -an | grep LISTEN | grep -E "3000|3001|8000|8001|5002"
```

## Logs

```bash
# Node.js logs
tail -f logs/api.log
tail -f logs/scheduler.log
tail -f logs/segment-gen.log
tail -f logs/embedder.log
tail -f logs/mastering.log

# Docker logs
docker logs radio-icecast
docker logs radio-liquidsoap
docker logs radio-piper-tts

# Follow logs
docker logs -f radio-liquidsoap
tail -f logs/*.log
```

## Database

```bash
# Run migrations
node infra/migrate.js up

# Rollback migration
node infra/migrate.js down

# Seed database
node infra/seed.js

# Reset database
node infra/migrate.js down
node infra/migrate.js up
node infra/seed.js

# Cleanup old segments
node infra/cleanup.js
```

## Testing

```bash
# Health checks
curl http://localhost:8000/health
curl http://localhost:5002/health

# Test stream
curl -I http://localhost:8001/radio.opus
ffplay http://localhost:8001/radio.opus

# Test API endpoint
curl http://localhost:8000/admin/broadcast-schedule

# Monitor stream
apps/playout/monitor-stream.sh
```

## Development

```bash
# Install dependencies
pnpm install

# Type checking
pnpm typecheck

# Build all
pnpm build

# Run tests
pnpm test

# Quality gate
pnpm quality-gate
```

## Troubleshooting

```bash
# Port conflict - find process
lsof -i :8000

# Port conflict - kill process
kill $(lsof -t -i:8000)

# Force kill all
pkill -9 -f "pnpm"
pkill -9 -f "tsx"
pkill -9 -f "node.*dist"

# Restart Docker services
docker compose restart
cd apps/playout && docker compose restart

# Clean Docker
docker compose down
docker compose up -d --build

# Clear audio cache
rm -rf apps/playout/audio/*.wav

# Clear TTS cache
rm -rf cache/tts/*
```

## Docker Commands

```bash
# View containers
docker ps
docker ps -a

# View logs
docker logs <container>
docker logs -f <container>

# Restart service
docker restart <container>

# Rebuild
docker compose build --no-cache
docker compose up -d

# Clean up
docker compose down
docker system prune
```

## Process Management

```bash
# Find process by port
lsof -i :8000

# Find process by name
pgrep -f scheduler-worker

# Kill process by PID
kill <PID>
kill -9 <PID>  # Force kill

# Kill by name
pkill -f scheduler-worker
pkill -9 -f scheduler-worker  # Force

# View process details
ps aux | grep <PID>
ps -p <PID> -o command=
```

## File Locations

```bash
# Configuration
.env                           # Environment variables
apps/playout/icecast.xml       # Icecast config
apps/playout/radio.liq         # Liquidsoap script

# Audio
apps/playout/audio/            # Generated segments
apps/playout/emergency/        # Fallback audio
cache/tts/                     # TTS cache

# Logs
logs/                          # Node.js service logs
apps/playout/logs/             # Liquidsoap logs

# Database
infra/migrations/              # Database migrations
infra/seed.js                  # Seed data
```

## Quick Tests

```bash
# Test full stack
./ops/start-all.sh
sleep 10
./ops/status.sh
curl http://localhost:8000/health
curl -I http://localhost:8001/radio.opus

# Test stream playback
ffplay http://localhost:8001/radio.opus

# Test admin dashboard
open http://localhost:3001

# Test public player
open http://localhost:3000
```

## Common Task Flows

### Full System Startup
```bash
./ops/start-all.sh
# Wait 10 seconds
pnpm --filter @radio/admin dev      # Terminal 1
pnpm --filter @radio/web dev        # Terminal 2
./ops/status.sh                     # Verify
```

### Full System Shutdown
```bash
# Ctrl+C in web interface terminals
./ops/stop-all.sh
```

### Restart After Code Changes
```bash
# Backend changes (API/Workers)
pkill -f "@radio/(api|scheduler|segment|embedder|mastering)"
pnpm --filter @radio/api dev

# Frontend changes
# Just refresh browser (Next.js hot reload)

# Streaming changes
cd apps/playout && docker compose restart
```

### Debug Stream Issues
```bash
docker logs radio-liquidsoap -f     # Check Liquidsoap
docker logs radio-icecast           # Check Icecast
curl -I http://localhost:8001/radio.opus  # Test stream
ls -la apps/playout/audio/          # Check segments
./ops/status.sh                     # Check all services
```

## Environment Variables Reference

```bash
# Check current values
cat .env | grep -E "^[A-Z]"

# Verify required vars
cat .env | grep -E "ANTHROPIC_API_KEY|SUPABASE_URL|ICECAST_PORT"

# Port configuration
ICECAST_PORT=8001
PORT=8000  # API server
```

## Git Operations

```bash
# View status
git status

# Commit changes
git add .
git commit -m "Your message"

# Create branch
git checkout -b feature-name

# View logs
git log --oneline -10
```

---

**Print this page and keep it handy!** 📋
