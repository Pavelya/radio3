# AI Radio 2525 - Quick Start Guide

Get the radio station up and running in minutes.

## Prerequisites

1. **Node.js & pnpm** installed
   ```bash
   node --version  # Should be v20+
   pnpm --version
   ```

2. **Docker** installed and running
   ```bash
   docker --version
   docker ps
   ```

3. **Environment file** configured
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Dependencies** installed
   ```bash
   pnpm install
   ```

5. **Database** migrated
   ```bash
   node infra/migrate.js up
   node infra/seed.js  # Optional: adds test data
   ```

## Start Everything

### Quick Start (Automated)

```bash
# Start all backend services
./ops/start-all.sh

# In separate terminals, start web interfaces:
pnpm --filter @radio/admin dev     # Terminal 1: Admin (port 3001)
pnpm --filter @radio/web dev       # Terminal 2: Public Player (port 3000)
```

### Check Status

```bash
./ops/status.sh
```

You should see:
- ✓ All Docker services running
- ✓ API Server listening on port 8000
- ✓ Workers processing jobs
- ✓ Stream available

## Access the Station

| Interface | URL | Purpose |
|-----------|-----|---------|
| **Public Player** | http://localhost:3000 | Listen to the stream |
| **Admin Dashboard** | http://localhost:3001 | Manage content & schedule |
| **Stream (Opus)** | http://localhost:8001/radio.opus | Direct stream link |
| **Stream (MP3)** | http://localhost:8001/radio.mp3 | Fallback stream |

## Manual Start (Step by Step)

If you prefer to start services manually:

### 1. Start Docker Services

```bash
# Piper TTS (speech synthesis)
docker compose up -d piper-tts

# Icecast + Liquidsoap (streaming)
cd apps/playout
docker compose up -d
cd ../..
```

### 2. Start API Server

```bash
# Terminal 1
pnpm --filter @radio/api dev
```

### 3. Start Workers

```bash
# Terminal 2
pnpm --filter @radio/scheduler-worker start

# Terminal 3
pnpm --filter @radio/segment-gen-worker start

# Terminal 4
pnpm --filter @radio/embedder-worker start

# Terminal 5
pnpm --filter @radio/mastering-worker start
```

### 4. Start Web Interfaces

```bash
# Terminal 6
pnpm --filter @radio/admin dev

# Terminal 7
pnpm --filter @radio/web dev
```

## Stop Everything

```bash
# Stop all services
./ops/stop-all.sh

# Or press Ctrl+C in each terminal
```

## Test the Stream

### Using ffplay

```bash
ffplay http://localhost:8001/radio.opus
```

### Using the Web Player

1. Open http://localhost:3000
2. Click the play button
3. Adjust volume
4. Enjoy the stream!

### Using curl

```bash
# Check stream is available
curl -I http://localhost:8001/radio.opus

# Should return: HTTP/1.1 200 OK
```

## Common Issues

### Port already in use

```bash
# Check what's using the port
lsof -i :8000

# Kill the process
kill $(lsof -t -i:8000)
```

### Docker services won't start

```bash
# Restart Docker
docker compose restart

# Or rebuild
docker compose build --no-cache
docker compose up -d
```

### No audio output

1. Check workers are running: `./ops/status.sh`
2. Check Liquidsoap logs: `docker logs radio-liquidsoap`
3. Verify segments exist: `ls -la apps/playout/audio/`

### Stream shows "offline"

1. Check Icecast is running: `docker ps | grep icecast`
2. Check Liquidsoap connected: `docker logs radio-liquidsoap | grep "connected"`
3. Visit Icecast status: http://localhost:8001/status.xsl

## Next Steps

### Add Content

1. Open Admin Dashboard: http://localhost:3001
2. Navigate to **Content** → **Knowledge Base**
3. Add articles, events, and voice clones

### Configure Schedule

1. Open Admin Dashboard: http://localhost:3001
2. Navigate to **Schedule** → **Programs**
3. Create programs and assign to time slots

### Monitor System

1. Visit **Analytics** in Admin Dashboard
2. Check segment generation status
3. View schedule visualization

## Documentation

- **[OPERATIONS.md](OPERATIONS.md)** - Complete operations guide
- **[ARCHITECTURE.md](.claude/ARCHITECTURE.md)** - System architecture
- **[TESTING.md](TESTING.md)** - Testing procedures
- **[apps/playout/README.md](apps/playout/README.md)** - Streaming setup

## Quick Reference

```bash
# Start everything
./ops/start-all.sh

# Check status
./ops/status.sh

# Stop everything
./ops/stop-all.sh

# View logs
tail -f logs/*.log

# Docker logs
docker logs radio-liquidsoap -f
```

## Getting Help

1. Check logs: `tail -f logs/*.log`
2. Check status: `./ops/status.sh`
3. Review [OPERATIONS.md](OPERATIONS.md) for troubleshooting
4. Check Docker logs: `docker logs <container-name>`

---

**You're all set!** The station should now be streaming at http://localhost:8001/radio.opus

Listen via the web player at http://localhost:3000 or use your favorite audio player.
