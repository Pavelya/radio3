# Sound Effects & Music Sources

## Free Sound Effects

### 1. Freesound.org
- **URL:** https://freesound.org
- **License:** CC0, CC-BY, CC-BY-NC
- **Categories:** Ambience, space sounds, tech sounds, transitions
- **API:** Available for bulk download

**Search queries:**
- "space ambience"
- "futuristic transition"
- "technology beep"
- "radio static"
- "whoosh"

### 2. BBC Sound Effects
- **URL:** https://sound-effects.bbcrewind.co.uk
- **License:** RemArc license (free for personal/educational)
- **Count:** 16,000+ effects
- **Categories:** Excellent for professional radio sounds

### 3. Zapsplat
- **URL:** https://www.zapsplat.com
- **License:** Free with attribution
- **Categories:** UI sounds, transitions, impacts

## Free Music Sources

### 1. YouTube Audio Library
- **URL:** https://www.youtube.com/audiolibrary
- **License:** Royalty-free, many don't require attribution
- **Genres:** All genres, high quality
- **Download:** MP3, direct download

### 2. Incompetech (Kevin MacLeod)
- **URL:** https://incompetech.com/music
- **License:** CC-BY 4.0
- **Attribution:** "Music by Kevin MacLeod (incompetech.com)"
- **Genres:** Huge variety, professional quality

### 3. Free Music Archive
- **URL:** https://freemusicarchive.org
- **License:** Various CC licenses
- **Genres:** Independent artists, eclectic

### 4. Pixabay Music
- **URL:** https://pixabay.com/music
- **License:** Pixabay License (free, no attribution)
- **Quality:** Good for background music

## Recommended Downloads

### Space/Sci-Fi Ambience
- Space station hum
- Spaceship interior
- Alien planet atmosphere
- Futuristic city sounds

### Transitions
- Whoosh sounds (3-5 variations)
- Digital transitions
- Energy swooshes
- Quick impacts

### UI/Tech Sounds
- Beeps and boops
- Notification sounds
- Success/completion sounds
- Error sounds

### Music Categories Needed
- **Morning Energy:** Upbeat electronic, positive
- **Afternoon Focus:** Mid-tempo, instrumental
- **Evening Chill:** Ambient, downtempo
- **Night Calm:** Atmospheric, minimal
- **News Bed:** Serious, steady rhythm
- **Interview Bed:** Light jazz, conversational
- **Culture Bed:** World music, eclectic

## Attribution Template

When using CC-BY licensed content:
```
Music/Sound: "[Title]" by [Artist]
License: CC-BY 4.0
Source: [URL]
```

## Automation Script

See `infra/download-audio-library.js` for bulk downloading from sources.

## Storage Structure

Audio files should be uploaded to Supabase storage in the following buckets:

- **audio-assets/music/** - Music tracks
- **audio-assets/jingles/** - Station IDs and jingles
- **audio-assets/sfx/** - Sound effects

## Integration

After downloading and reviewing audio files:

1. Upload files using: `node infra/upload-audio-library.js`
2. View and manage in admin interface
3. Audio will be automatically included in format clocks and playout
