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

# Cleanup old segments (SMART - recommended)
# Selectively deletes old incomplete segments while preserving ready ones
# Deletes: queued, retrieving, generating, rendering, normalizing, failed segments
# Keeps: All ready, airing, aired, archived segments
# Also removes orphaned jobs (segment_make jobs with no segments)

# Preview what would be deleted
node infra/cleanup-old-segments.js --dry-run

# Run cleanup with default settings (1 day retention)
node infra/cleanup-old-segments.js

# Adjust retention period
node infra/cleanup-old-segments.js --days=2           # Keep last 2 days

# Cleanup EVERYTHING (nuclear option - use with caution!)
# Deletes ALL segments, jobs, DLQ items, health checks
node infra/cleanup.js

## Cleanup Scenarios - What to Run When

### Scenario 1: Normal Maintenance (Weekly/Monthly)
# Situation: System running fine, just cleaning up old failed segments
# What to run:
node infra/cleanup-old-segments.js --dry-run  # Preview first
node infra/cleanup-old-segments.js            # Clean up last 24 hours

### Scenario 2: Changed/Deleted Programs
# Situation: You edited or deleted a program, old segments still in database
# Example: Deleted "Morning News", created "New Morning Show"
# Problem: Old segments from deleted program will still play
# What to run:
node infra/cleanup-old-segments.js --days=7   # Remove old incomplete segments from last week
# OR for complete reset:
node infra/cleanup.js                         # Delete ALL segments, start fresh

### Scenario 3: System Stuck in the Past
# Situation: Playout playing content from days ago, wrong dates in audio
# Example: Today is Nov 17, but DJ says "Good morning, it's Nov 9"
# Problem: Many old ready segments with past timestamps
# What to run:
node infra/cleanup.js                         # Nuclear option - delete everything
# Then wait 5 minutes for scheduler to create fresh segments

### Scenario 4: Too Many Queued Segments (System Overload)
# Situation: Thousands of queued/failed segments, dashboard shows huge numbers
# Problem: Workers can't keep up, system out of sync
# What to run:
node infra/cleanup-old-segments.js --dry-run  # See how many would be deleted
node infra/cleanup-old-segments.js --days=1   # Keep only last day
# Check dashboard, if still too many:
node infra/cleanup.js                         # Complete reset

### Scenario 5: Broadcast Was Down, Workers Kept Running
# Situation: Playout stopped, but workers created segments for multiple days
# Problem: Now have segments for 3+ days in the future
# What to run:
node infra/cleanup-old-segments.js --days=1   # Remove segments older than 1 day
# This is usually fine - extra ready segments don't hurt

### Scenario 6: Workers Were Down, Broadcast Kept Running
# Situation: Workers stopped, playout ran out of segments, played emergency audio
# Problem: Need to generate new segments quickly
# What to run:
# No cleanup needed! Just restart workers:
pnpm --filter @radio/scheduler-worker start
pnpm --filter @radio/segment-gen-worker start
# Wait 5-10 minutes for segments to generate

### Scenario 7: Fresh Start for Testing/Development
# Situation: Want clean slate for testing new features
# What to run:
node infra/cleanup.js                         # Delete everything
node infra/migrate.js down                    # Optional: reset database
node infra/migrate.js up
node infra/seed.js                            # Recreate seed data
# Wait for scheduler to create new segments

### Scenario 8: After Major Configuration Changes
# Situation: Changed format clocks, weekly schedule, or multiple programs
# Problem: Old segments don't match new configuration
# What to run:
node infra/cleanup.js                         # Delete all segments
# Restart scheduler to generate fresh segments
pkill -f scheduler-worker
pnpm --filter @radio/scheduler-worker start

## Quick Decision Tree

# Check dashboard first:
# - If < 100 queued/failed segments → Run selective cleanup (cleanup-old-segments.js)
# - If > 100 old segments → Consider nuclear cleanup (cleanup.js)
# - If content has wrong dates → Nuclear cleanup required
# - If just changed programs → Nuclear cleanup recommended
# - If system running fine → No cleanup needed, or just maintenance cleanup
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
