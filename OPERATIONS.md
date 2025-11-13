# AI Radio 2525 - Operations Guide

Complete guide for starting and stopping all services.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AI RADIO 2525                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WEB INTERFACES                                             │
│  ├─ Public Player (port 3000)       ← Task F1              │
│  └─ Admin Dashboard (port 3001)                             │
│                                                             │
│  API & SERVICES                                             │
│  ├─ API Server (port 8000)          ← Task P6              │
│  ├─ Piper TTS (port 5002) [Docker]                         │
│  ├─ Icecast (port 8001) [Docker]    ← Task P4              │
│  └─ Liquidsoap [Docker]             ← Task P4              │
│                                                             │
│  WORKERS                                                    │
│  ├─ Scheduler Worker                ← Task P6              │
│  ├─ Segment Gen Workers (x3)        ← Task P2              │
│  ├─ Embedder Workers (x2)           ← Task P1              │
│  └─ Mastering Workers (x2)          ← Task P3              │
│                                                             │
│  EXTERNAL                                                   │
│  ├─ Supabase (cloud database)                              │
│  └─ Redis (optional caching)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start (Everything)

### Option 1: Using Startup Scripts (Recommended)

```bash
# Start everything
./ops/start-all.sh

# Stop everything
./ops/stop-all.sh
```

### Option 2: Manual Step-by-Step

See sections below for detailed manual control.

---

## Prerequisites

Before starting, ensure you have:

1. **Environment configured**
   ```bash
   # Check .env file exists
   cat .env | grep -E "SUPABASE_URL|ANTHROPIC_API_KEY|ICECAST_PORT"
   ```

2. **Dependencies installed**
   ```bash
   pnpm install
   ```

3. **Docker running**
   ```bash
   docker --version
   docker compose version
   ```

4. **Database migrated**
   ```bash
   node infra/migrate.js up
   node infra/seed.js  # Optional: seed test data
   ```

---

## Starting Services

### Step 1: Start Docker Services (Streaming Infrastructure)

These services run Icecast, Liquidsoap, and Piper TTS.

```bash
# Start Piper TTS (speech synthesis)
docker compose up -d piper-tts

# Start streaming infrastructure (Icecast + Liquidsoap)
cd apps/playout
docker compose up -d
cd ../..

# Verify services are running
docker ps
# Expected: radio-piper-tts, radio-icecast, radio-liquidsoap, radio-monitor
```

**Health checks:**
- Piper TTS: http://localhost:5002/health
- Icecast: http://localhost:8001/status.xsl
- Stream: http://localhost:8001/radio.opus

### Step 2: Start API Server

The API server handles all backend operations.

```bash
# Terminal 1: API Server (port 8000)
pnpm --filter @radio/api dev

# Verify
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

### Step 3: Start Workers (Content Production)

Workers generate and process content. Start in separate terminals:

```bash
# Terminal 2: Scheduler Worker (creates segment jobs)
pnpm --filter @radio/scheduler-worker start

# Terminal 3: Segment Gen Worker (generates scripts & audio)
pnpm --filter @radio/segment-gen-worker start

# Terminal 4: Embedder Worker (processes knowledge base)
pnpm --filter @radio/embedder-worker start

# Terminal 5: Mastering Worker (audio processing)
pnpm --filter @radio/mastering-worker start
```

**Note:** You can start multiple instances of workers by running the command in additional terminals.

### Step 4: Start Web Interfaces

```bash
# Terminal 6: Admin Dashboard (port 3001)
pnpm --filter @radio/admin dev

# Terminal 7: Public Web Player (port 3000)
pnpm --filter @radio/web dev
```

---

## Stopping Services

### Stop All Services

```bash
# 1. Stop Node.js processes
# Press Ctrl+C in each terminal running pnpm

# Or kill all at once:
pkill -f "pnpm.*dev"
pkill -f "pnpm.*start"
pkill -f "node.*dist"

# 2. Stop Docker services
docker compose down                    # Stops Piper TTS (from root)
cd apps/playout && docker compose down # Stops Icecast/Liquidsoap
cd ../..

# Verify all stopped
docker ps  # Should show no radio services
lsof -i :3000,3001,8000,8001,5002  # Should show no processes
```

### Stop Individual Services

```bash
# Stop specific Docker service
docker stop radio-icecast
docker stop radio-liquidsoap
docker stop radio-piper-tts
docker stop radio-monitor

# Stop specific worker (find PID first)
ps aux | grep "@radio/scheduler-worker"
kill <PID>

# Or use pkill with filter
pkill -f "scheduler-worker"
```

---

## Service URLs & Ports

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Public Player** | 3000 | http://localhost:3000 | Public listening interface |
| **Admin Dashboard** | 3001 | http://localhost:3001 | Station management |
| **API Server** | 8000 | http://localhost:8000 | Backend API |
| **Icecast** | 8001 | http://localhost:8001 | Streaming server |
| **Piper TTS** | 5002 | http://localhost:5002 | Speech synthesis |

**Stream URLs:**
- Primary (Opus): http://localhost:8001/radio.opus
- Fallback (MP3): http://localhost:8001/radio.mp3

---

## Monitoring & Health Checks

### Check All Services Status

```bash
# Docker services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Node processes
ps aux | grep -E "pnpm|node.*dist" | grep -v grep

# Port listeners
lsof -i :3000,3001,8000,8001,5002
```

### Check Logs

```bash
# Docker logs
docker logs radio-icecast
docker logs radio-liquidsoap
docker logs radio-piper-tts

# Node logs (if running in background)
# Check the terminal where you started each service
```

### Test Stream

```bash
# Check stream is live
curl -I http://localhost:8001/radio.opus
# Expected: HTTP/1.1 200 OK

# Play stream (requires ffplay)
ffplay http://localhost:8001/radio.opus

# Monitor stream
apps/playout/monitor-stream.sh
```

---

## Troubleshooting

### Port Conflicts

```bash
# Check what's using a port
lsof -i :8000

# Kill process on specific port
kill $(lsof -t -i:8000)
```

### Docker Issues

```bash
# Restart Docker services
cd apps/playout
docker compose restart

# Rebuild if needed
docker compose build --no-cache
docker compose up -d
```

### Database Issues

```bash
# Check connection
node infra/test-db.js

# Re-run migrations
node infra/migrate.js down
node infra/migrate.js up
```

### Worker Issues

```bash
# Check job queue
# Open admin dashboard: http://localhost:3001/dashboard/segments

# Clear stuck jobs (be careful!)
node infra/cleanup.js
```

---

## Development Workflows

### Full Stack Development

All services running, hot reload enabled:

```bash
# Terminal 1: Docker services (background)
docker compose up -d
cd apps/playout && docker compose up -d && cd ../..

# Terminal 2: API
pnpm --filter @radio/api dev

# Terminal 3: Admin
pnpm --filter @radio/admin dev

# Terminal 4: Web Player
pnpm --filter @radio/web dev

# Terminal 5+: Workers as needed
pnpm --filter @radio/scheduler-worker start
```

### Frontend Only (Admin or Web Player)

If you're working on UI and don't need streaming:

```bash
# Terminal 1: API only
pnpm --filter @radio/api dev

# Terminal 2: Admin or Web
pnpm --filter @radio/admin dev
# or
pnpm --filter @radio/web dev
```

### Streaming Only (Testing Playout)

If you're working on streaming/audio:

```bash
# Docker services
cd apps/playout
docker compose up

# API + Workers
pnpm --filter @radio/api dev
pnpm --filter @radio/scheduler-worker start
pnpm --filter @radio/segment-gen-worker start
pnpm --filter @radio/mastering-worker start
```

---

## Automated Startup Scripts

### Create Start Script

The guide references `./ops/start-all.sh` - create it:

```bash
# See next section for script contents
```

### Create Stop Script

The guide references `./ops/stop-all.sh` - create it:

```bash
# See next section for script contents
```

---

## Service Dependencies

**Start Order (Important):**
1. Docker services (Icecast, Liquidsoap, Piper TTS)
2. API Server
3. Workers (Scheduler → Segment Gen → Mastering)
4. Web interfaces (Admin, Public Player)

**Why this order?**
- Workers need API to be running
- Liquidsoap needs Icecast to be running
- Everything needs the database (Supabase - always running)

---

## Emergency Procedures

### Stream Down

```bash
# 1. Check Icecast
curl http://localhost:8001/status.xsl

# 2. Restart streaming
cd apps/playout
docker compose restart

# 3. Check Liquidsoap logs
docker logs radio-liquidsoap --tail 50
```

### Out of Disk Space

```bash
# Check audio cache
du -sh apps/playout/audio/*
rm -rf apps/playout/audio/*.wav  # Clear old segments

# Check TTS cache
du -sh cache/tts/*
rm -rf cache/tts/*  # Clear TTS cache
```

### Database Connection Lost

```bash
# Check .env has correct SUPABASE_URL
cat .env | grep SUPABASE_URL

# Restart API and workers
pkill -f "pnpm.*dev"
pnpm --filter @radio/api dev
```

---

## Production Deployment

For production, use PM2 or similar process manager:

```bash
# Build all services
pnpm build

# Start with PM2 (example)
pm2 start ecosystem.config.js

# Or use systemd services
# See deployment documentation
```

---

## Next Steps

- **Test the system**: [TESTING.md](TESTING.md)
- **Configure schedule**: http://localhost:3001/dashboard/broadcast-schedule
- **Add content**: http://localhost:3001/dashboard/content
- **Listen**: http://localhost:3000

---

**Quick Reference Card:**

```
START:  ./ops/start-all.sh
STOP:   ./ops/stop-all.sh
STATUS: docker ps && lsof -i :3000,3001,8000,8001,5002
LOGS:   docker logs <container>
TEST:   curl http://localhost:8001/radio.opus
LISTEN: http://localhost:3000
ADMIN:  http://localhost:3001
```
