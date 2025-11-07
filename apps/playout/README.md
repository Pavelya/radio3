# AI Radio 2525 - Playout System

Docker-based radio playout system using Liquidsoap and Icecast.

## Architecture

```
┌─────────────────┐
│  Host Machine   │
│                 │
│  ┌───────────┐  │
│  │ API:8000  │  │
│  └─────▲─────┘  │
│        │        │
│  ┌─────┴─────────────────────────┐
│  │ Docker Network                │
│  │                               │
│  │  ┌──────────────────────┐    │
│  │  │ Liquidsoap Container │    │
│  │  │ - Polls API          │    │
│  │  │ - Plays audio        │    │
│  │  │ - Streams to Icecast │    │
│  │  └──────────┬───────────┘    │
│  │             │                 │
│  │  ┌──────────▼───────────┐    │
│  │  │ Icecast Container    │    │
│  │  │ - Port 8000 (int)    │    │
│  │  │ - Port 8001 (ext)    │◄───┼─── Listeners
│  │  └──────────────────────┘    │
│  │                               │
│  └───────────────────────────────┘
└─────────────────┘
```

## Port Configuration

**Important: Port 8000 is used by the API, so Icecast is exposed on port 8001**

| Service | Container Port | Host Port | Purpose |
|---------|---------------|-----------|---------|
| API | - | 8000 | REST API for playout endpoints |
| Icecast | 8000 | **8001** | Streaming server (changed to avoid conflict) |
| Liquidsoap | - | - | Internal only, connects to Icecast |

## Access Points

- **Stream URL (Opus)**: `http://localhost:8001/radio.opus`
- **Stream URL (MP3)**: `http://localhost:8001/radio.mp3`
- **Icecast Admin**: `http://localhost:8001/admin/` (user: admin, pass: admin)
- **Icecast Status**: `http://localhost:8001/status.xsl`
- **API**: `http://localhost:8000` (running on host)

## Networking Details

### Docker → Host Communication

Liquidsoap needs to access the API running on the host machine:

```yaml
# docker-compose.yml
environment:
  - API_URL=http://host.docker.internal:8000  # Access host API

extra_hosts:
  - "host.docker.internal:host-gateway"  # Enable on Linux
```

### Container → Container Communication

Liquidsoap connects to Icecast using the service name:

```yaml
environment:
  - ICECAST_HOST=icecast  # Docker service name
  - ICECAST_PORT=8000     # Container internal port
```

## Quick Start

### Prerequisites

1. API server running on host: `http://localhost:8000`
2. Docker and Docker Compose installed

### Start Playout System

```bash
cd apps/playout

# Start services (builds on first run)
docker-compose up -d

# Watch logs
docker-compose logs -f liquidsoap

# Check Icecast status
curl http://localhost:8001/status.xsl

# Test stream playback
ffplay http://localhost:8001/radio.opus
```

### Stop Playout System

```bash
docker-compose down

# To also remove volumes
docker-compose down -v
```

## Development

### Directory Structure

```
apps/playout/
├── Dockerfile              # Liquidsoap container image
├── docker-compose.yml      # Service orchestration
├── radio.liq               # Liquidsoap configuration
├── fetch-next.sh           # Script to fetch segments from API
├── icecast.xml             # Icecast configuration
├── .env                    # Environment variables
├── audio/                  # Downloaded segment audio files
├── logs/                   # Liquidsoap logs
└── README.md               # This file
```

### Environment Variables

See [.env](.env) file for all configuration options.

Key variables:
- `API_URL`: URL to API server (overridden in docker-compose.yml)
- `ICECAST_PORT`: Set to 8001 for host access
- `OUTPUT_DIR`: Audio cache directory
- `LIMIT`: Number of segments to fetch per poll

### Rebuild After Changes

```bash
# Rebuild Liquidsoap image after modifying Dockerfile, radio.liq, or fetch-next.sh
docker-compose build liquidsoap

# Restart with new image
docker-compose up -d liquidsoap
```

### Debugging

```bash
# View Liquidsoap logs
docker-compose logs -f liquidsoap

# View Icecast logs
docker-compose logs -f icecast

# Enter Liquidsoap container
docker-compose exec liquidsoap bash

# Test fetch script manually
docker-compose exec liquidsoap bash /radio/fetch-next.sh

# Check Liquidsoap telnet interface
telnet localhost 1234
```

### Testing Without Full System

If you want to test without the full API:

1. Place test WAV files in `audio/` directory
2. Liquidsoap will play them on repeat
3. Stream available at `http://localhost:8001/radio.opus`

## Troubleshooting

### Port Already in Use

If you see "port is already allocated":

```bash
# Check what's using port 8001
lsof -i :8001

# If it's an old container:
docker-compose down
```

### Cannot Connect to API

If Liquidsoap can't reach the API:

1. Verify API is running: `curl http://localhost:8000/health`
2. Check Docker can reach host: `docker-compose exec liquidsoap curl http://host.docker.internal:8000/health`
3. On Linux, ensure `extra_hosts` is configured in docker-compose.yml

### No Audio Playing

1. Check segments are downloaded: `ls -la audio/`
2. Verify API endpoints exist: `curl http://localhost:8000/playout/next`
3. Check Liquidsoap logs: `docker-compose logs liquidsoap`
4. Test Icecast directly: `curl -I http://localhost:8001/radio.opus`

### Audio Files Not Downloading

1. Verify fetch script works: `docker-compose exec liquidsoap bash /radio/fetch-next.sh`
2. Check API returns segments: `curl http://localhost:8000/playout/next?limit=5`
3. Verify audio URLs are accessible
4. Check curl/jq are installed in container

## Production Considerations

### Security

Before deploying to production:

1. **Change default passwords** in icecast.xml and docker-compose.yml
2. **Enable HTTPS** for Icecast (configure SSL certificates)
3. **Restrict admin access** (firewall rules for /admin/ endpoint)
4. **Use secrets management** (not .env files) for credentials

### Performance

1. **Storage**: Monitor `audio/` directory size, implement cleanup
2. **Memory**: Adjust Docker memory limits if needed
3. **Network**: Consider bandwidth limits for multiple listeners
4. **Logging**: Rotate logs in `logs/` directory

### Monitoring

Recommended monitoring:

1. Stream uptime (check `/status.xsl` endpoint)
2. Listener count (parse Icecast status)
3. Audio buffer health (Liquidsoap telnet commands)
4. API connectivity (log API errors)

## API Integration

Liquidsoap polls these API endpoints:

### GET /playout/next

Fetches next segments to play:

```bash
curl "http://localhost:8000/playout/next?limit=10"
```

Response:
```json
{
  "segments": [
    {
      "id": "uuid",
      "title": "Segment Title",
      "audio_url": "https://...",
      "duration_sec": 45.2,
      "slot_type": "news"
    }
  ]
}
```

### POST /playout/now-playing

Reports currently playing segment:

```bash
curl -X POST http://localhost:8000/playout/now-playing \
  -H "Content-Type: application/json" \
  -d '{
    "segment_id": "uuid",
    "title": "Segment Title",
    "timestamp": "2025-01-01T12:00:00Z"
  }'
```

## Future Enhancements

Planned improvements (Tasks P2-P6):

- **P2**: Playout API endpoints implementation
- **P3**: Schedule generator worker
- **P4**: Dead air detection and emergency fallback
- **P5**: Priority segment injection for breaking news
- **P6**: Schedule visualization and analytics

## Links

- **Liquidsoap Documentation**: https://www.liquidsoap.info/
- **Icecast Documentation**: https://icecast.org/docs/
- **Project Architecture**: `../../.claude/ARCHITECTURE.md`
- **Task Specifications**: `../../.claude/TASKS.md` (Tasks P1-P6)
