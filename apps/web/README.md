# AI Radio 2525 - Public Web Player

Public-facing web player for AI Radio 2525. Built with Next.js 14.

## Features

- Audio streaming with play/pause controls
- Volume control
- Now-playing display with live metadata
- Auto-fallback from Opus to MP3 format
- Responsive design
- Real-time status updates

## Development

```bash
# Install dependencies (from root)
pnpm install

# Run dev server
pnpm --filter @radio/web dev

# Build for production
pnpm --filter @radio/web build

# Start production server
pnpm --filter @radio/web start
```

## URLs

- **Development**: http://localhost:3000
- **Stream (Opus)**: http://localhost:8001/radio.opus
- **Stream (MP3)**: http://localhost:8001/radio.mp3
- **Icecast Status**: http://localhost:8001/status-json.xsl

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_STREAM_URL=http://localhost:8001/radio.opus
NEXT_PUBLIC_STREAM_URL_FALLBACK=http://localhost:8001/radio.mp3
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Architecture

### Components

- `components/audio-player.tsx` - Audio streaming controls
- `components/now-playing.tsx` - Live metadata display

### Pages

- `app/page.tsx` - Home page with player and info
- `app/layout.tsx` - Root layout with metadata

## Port Configuration

- Web Player: 3000
- Admin Dashboard: 3001
- API Server: 8000
- Icecast: 8001

## Testing

1. Start Icecast and Liquidsoap:
   ```bash
   cd apps/playout
   # Start services (see playout README)
   ```

2. Start the web player:
   ```bash
   pnpm --filter @radio/web dev
   ```

3. Open http://localhost:3000

4. Test functionality:
   - Click play button (should start streaming)
   - Adjust volume
   - Verify now-playing updates
   - Test responsive design on mobile viewport

## Browser Compatibility

- Modern browsers with HTML5 audio support
- Opus codec support (Chrome, Firefox, Edge)
- MP3 fallback for older browsers
