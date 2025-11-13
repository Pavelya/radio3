# Operations Scripts

Quick reference for managing AI Radio 2525 services.

## Scripts

### `start-all.sh` - Start All Services

Starts all required services in the correct order:
1. Docker services (Piper TTS, Icecast, Liquidsoap)
2. API Server
3. Workers (Scheduler, Segment Gen, Embedder, Mastering)

```bash
./ops/start-all.sh
```

**Note:** Web interfaces (Admin/Public Player) are not auto-started. Run them manually:
```bash
pnpm --filter @radio/admin dev     # Terminal 1
pnpm --filter @radio/web dev       # Terminal 2
```

### `stop-all.sh` - Stop All Services

Stops all running services:
- Kills all Node.js processes
- Stops all Docker containers
- Verifies shutdown

```bash
./ops/stop-all.sh
```

### `status.sh` - Check Service Status

Quick status check of all services with health checks.

```bash
./ops/status.sh
```

Output includes:
- Docker service status
- Port listeners
- Worker processes
- Health check results
- Quick links

## Common Operations

### Full Startup

```bash
# Start everything
./ops/start-all.sh

# Check status
./ops/status.sh

# Start web interfaces (in separate terminals)
pnpm --filter @radio/admin dev
pnpm --filter @radio/web dev
```

### Full Shutdown

```bash
# Stop web interfaces first (Ctrl+C in terminals)

# Stop everything else
./ops/stop-all.sh
```

### Check What's Running

```bash
./ops/status.sh
```

### View Logs

```bash
# Node.js service logs
tail -f logs/*.log

# Docker logs
docker logs radio-icecast
docker logs radio-liquidsoap
docker logs radio-piper-tts

# Follow Docker logs
docker logs -f radio-liquidsoap
```

## Troubleshooting

### Services Won't Start

```bash
# Check what's using ports
lsof -i :8000
lsof -i :8001
lsof -i :5002

# Kill stuck processes
pkill -9 -f pnpm
pkill -9 -f tsx

# Restart Docker
docker compose restart
```

### Services Won't Stop

```bash
# Force stop everything
pkill -9 -f "pnpm"
pkill -9 -f "tsx"
pkill -9 -f "node.*dist"
docker stop $(docker ps -q --filter "name=radio-")
```

### Check Individual Service

```bash
# Check if service is running
pgrep -f scheduler-worker
pgrep -f segment-gen-worker

# Check Docker service
docker ps | grep radio-

# Test API
curl http://localhost:8000/health

# Test stream
curl -I http://localhost:8001/radio.opus
```

## Environment Setup

Before running scripts, ensure:

1. Dependencies installed: `pnpm install`
2. Database migrated: `node infra/migrate.js up`
3. Environment configured: `.env` file exists
4. Docker running: `docker --version`

## Service URLs

| Service | URL |
|---------|-----|
| Public Player | http://localhost:3000 |
| Admin Dashboard | http://localhost:3001 |
| API Server | http://localhost:8000 |
| Stream (Opus) | http://localhost:8001/radio.opus |
| Stream (MP3) | http://localhost:8001/radio.mp3 |
| Icecast Admin | http://localhost:8001/admin/ |
| Piper TTS | http://localhost:5002 |

## Log Files

Scripts create logs in `logs/` directory:
- `logs/api.log` - API server
- `logs/scheduler.log` - Scheduler worker
- `logs/segment-gen.log` - Segment generation worker
- `logs/embedder.log` - Embedder worker
- `logs/mastering.log` - Mastering worker

## More Information

See [OPERATIONS.md](../OPERATIONS.md) for complete documentation.
