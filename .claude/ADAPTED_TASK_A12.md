# Task A12: Music Library Management UI (ADAPTED)

**Tier:** Admin/CMS (Music & Audio tier)
**Estimated Time:** 5-6 hours
**Complexity:** Medium
**Prerequisites:** M1 (Music database schema) ✅ COMPLETED

---

## Architecture Adaptations

This task has been adapted from the original specification to match the Radio3 codebase architecture:

### Original Spec → Radio3 Reality

| Aspect | Original Spec | Radio3 Actual |
|--------|--------------|---------------|
| **Backend** | FastAPI + Python | Express.js + TypeScript |
| **Frontend** | Next.js Pages Router | Next.js 14 App Router |
| **Database Client** | Python Supabase SDK | @supabase/supabase-js (TypeScript) |
| **API Pattern** | FastAPI Router with Pydantic | Express Router + Service Classes |
| **UI Components** | Custom `@/components/ui` library | Direct Tailwind CSS (no component lib) |
| **Storage Bucket** | `music` | `audio-assets` with `music/` prefix |
| **Auth** | `require_admin` dependency | Middleware + Supabase SSR |
| **Music Routes** | New file `music.py` | Extend existing `apps/api/src/music/music-routes.ts` |
| **Music Service** | New Python class | Extend existing `apps/api/src/music/music-service.ts` |
| **Admin Music Page** | New page | Already exists at `apps/admin/app/dashboard/music/page.tsx` |

---

## What Already Exists ✅

From Task M1 and existing codebase:

1. **Database Schema** (`infra/migrations/016_music_library.sql`)
   - ✅ `music_tracks` table with all metadata fields
   - ✅ `music_genres` table
   - ✅ `jingles` and `sound_effects` tables
   - ✅ `music_playlists` and `playlist_tracks` tables
   - ✅ RPC function `increment_music_play_count()`

2. **TypeScript Types** (`packages/radio-core/src/types/music.types.ts`)
   - ✅ `MusicTrack`, `Jingle`, `SoundEffect` types
   - ✅ `NextTrackOptions` for filtering

3. **Music Service** (`apps/api/src/music/music-service.ts`)
   - ✅ `MusicService` class with Supabase client
   - ✅ Methods: `getNextTrack()`, `getJingle()`, `getSoundEffect()`, `listTracks()`, etc.

4. **Music API Routes** (`apps/api/src/music/music-routes.ts`)
   - ✅ `GET /music/tracks` - List tracks with filters
   - ✅ `GET /music/genres` - List genres
   - ✅ `POST /music/next-track` - Get next track for playout
   - ✅ `GET /music/jingle/:type` - Get jingle

5. **Admin Music Page** (`apps/admin/app/dashboard/music/page.tsx`)
   - ✅ Music library listing with table view
   - ✅ Stats dashboard (total, active, reviewed, genres)
   - ✅ Status badges and formatting

---

## What Needs to Be Built 🔨

### 1. Backend: File Upload API Endpoints

**File:** `apps/api/src/music/music-routes.ts` (extend existing)

Add new routes:
- `POST /music/upload` - Upload music file to Supabase Storage
- `POST /music/tracks` - Create track metadata after upload
- `PATCH /music/tracks/:id` - Update track metadata
- `DELETE /music/tracks/:id` - Delete track and file
- `GET /music/tracks/:id` - Get single track with signed URL

**File:** `apps/api/src/music/music-service.ts` (extend existing)

Add new methods:
- `uploadMusicFile(file, metadata)` - Handle upload with deduplication
- `createTrack(trackData)` - Create DB record
- `updateTrack(id, updates)` - Update metadata
- `deleteTrack(id)` - Delete track and storage file
- `getTrackById(id)` - Get track with signed audio URL

### 2. Frontend: Upload UI

**File:** `apps/admin/app/dashboard/music/upload/page.tsx` (NEW)

Music upload form with:
- File upload field (accept audio/*)
- Metadata form: title, artist, album, genre, mood, energy_level, etc.
- License information: license_type, attribution fields
- Tags input (comma-separated)
- Client-side validation
- Progress indicator
- Duplicate detection feedback
- Auto-extract duration from audio file

### 3. Frontend: Track Edit UI

**File:** `apps/admin/app/dashboard/music/[id]/page.tsx` (NEW)

Track edit page with:
- Load existing track data
- Same form as upload (pre-filled)
- Audio preview player
- Delete button with confirmation
- Save changes button

### 4. Frontend: Enhanced Music Listing

**File:** `apps/admin/app/dashboard/music/page.tsx` (ENHANCE EXISTING)

Add features:
- Search input (filter by title/artist)
- Genre filter dropdown
- Mood filter dropdown
- Active/Reviewed status toggles
- Edit button per track → `/dashboard/music/[id]`
- Delete button with confirmation
- Audio preview player (inline or modal)
- Pagination (if needed)

### 5. Client-Side Audio Utilities

**File:** `apps/admin/lib/audio-utils.ts` (NEW)

Helper functions:
- `getAudioDuration(file: File): Promise<number>` - Extract duration from file
- `validateAudioFile(file: File): boolean` - Check file type
- `formatDuration(seconds: number): string` - Display formatting

---

## Implementation Steps

### Step 1: Extend Music Service

**File:** `apps/api/src/music/music-service.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export class MusicService {
  private db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  // EXISTING METHODS: getNextTrack, getJingle, etc.
  // ... (keep all existing methods)

  // NEW METHODS FOR A12:

  async uploadMusicFile(
    fileBuffer: Buffer,
    filename: string,
    contentType: string
  ): Promise<{ storagePath: string; fileHash: string; isDuplicate: boolean; existingTrack?: any }> {
    // Calculate content hash for deduplication
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check for duplicates
    const { data: existing } = await this.db
      .from('music_tracks')
      .select('id, title, artist')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return {
        storagePath: '',
        fileHash,
        isDuplicate: true,
        existingTrack: existing,
      };
    }

    // Generate storage path: music/{hash_prefix}/{hash}.{ext}
    const ext = filename.split('.').pop() || 'mp3';
    const storagePath = `music/${fileHash.slice(0, 2)}/${fileHash}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await this.db.storage
      .from('audio-assets')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    return {
      storagePath,
      fileHash,
      isDuplicate: false,
    };
  }

  async createTrack(trackData: {
    title: string;
    artist?: string;
    album?: string;
    genre_id?: string;
    duration_sec: number;
    storage_path: string;
    file_hash: string;
    file_format?: string;
    license_type: string;
    attribution_required?: boolean;
    attribution_text?: string;
    mood?: string;
    tempo?: string;
    energy_level?: number;
    suitable_for_time?: string[];
    suitable_for_programs?: string[];
  }) {
    const { data, error } = await this.db
      .from('music_tracks')
      .insert({
        ...trackData,
        active: false, // Requires review before activation
        reviewed: false,
        play_count: 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create track: ${error.message}`);
    }

    return data;
  }

  async getTrackById(id: string) {
    const { data, error } = await this.db
      .from('music_tracks')
      .select('*, genre:music_genres(id, name)')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Track not found: ${error.message}`);
    }

    // Generate signed URL for audio playback
    if (data.storage_path) {
      const { data: signedUrl } = await this.db.storage
        .from('audio-assets')
        .createSignedUrl(data.storage_path, 3600); // 1 hour

      data.audio_url = signedUrl?.signedUrl || null;
    }

    return data;
  }

  async updateTrack(id: string, updates: Partial<{
    title: string;
    artist: string;
    album: string;
    genre_id: string;
    mood: string;
    tempo: string;
    energy_level: number;
    license_type: string;
    attribution_required: boolean;
    attribution_text: string;
    suitable_for_time: string[];
    suitable_for_programs: string[];
    active: boolean;
    reviewed: boolean;
  }>) {
    const { data, error } = await this.db
      .from('music_tracks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update track: ${error.message}`);
    }

    return data;
  }

  async deleteTrack(id: string) {
    // Get track info first
    const track = await this.getTrackById(id);

    // Delete file from storage
    if (track.storage_path) {
      const { error: storageError } = await this.db.storage
        .from('audio-assets')
        .remove([track.storage_path]);

      if (storageError) {
        console.error('Failed to delete storage file:', storageError);
        // Continue with DB deletion even if storage fails
      }
    }

    // Delete database record
    const { error } = await this.db
      .from('music_tracks')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete track: ${error.message}`);
    }

    return { success: true };
  }
}
```

---

### Step 2: Extend Music API Routes

**File:** `apps/api/src/music/music-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { MusicService } from './music-service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      cb(new Error('Only audio files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// EXISTING ROUTES (keep all)
// GET /music/tracks
// GET /music/genres
// POST /music/next-track
// GET /music/jingle/:jingle_type
// ... etc

// NEW ROUTES FOR A12:

// Upload music file
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const musicService = new MusicService(supabase);

    const result = await musicService.uploadMusicFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (result.isDuplicate) {
      return res.status(409).json({
        duplicate: true,
        existingTrack: result.existingTrack,
        message: 'File already exists in library',
      });
    }

    res.json({
      storagePath: result.storagePath,
      fileHash: result.fileHash,
      filename: req.file.originalname,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create track metadata
router.post('/tracks', async (req: Request, res: Response) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const musicService = new MusicService(supabase);

    const track = await musicService.createTrack(req.body);

    res.status(201).json({ track });
  } catch (error: any) {
    console.error('Create track error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get track by ID
router.get('/tracks/:id', async (req: Request, res: Response) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const musicService = new MusicService(supabase);

    const track = await musicService.getTrackById(req.params.id);

    res.json({ track });
  } catch (error: any) {
    console.error('Get track error:', error);
    res.status(404).json({ error: error.message });
  }
});

// Update track metadata
router.patch('/tracks/:id', async (req: Request, res: Response) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const musicService = new MusicService(supabase);

    const track = await musicService.updateTrack(req.params.id, req.body);

    res.json({ track });
  } catch (error: any) {
    console.error('Update track error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete track
router.delete('/tracks/:id', async (req: Request, res: Response) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const musicService = new MusicService(supabase);

    await musicService.deleteTrack(req.params.id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete track error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

**Also add multer dependency:**
```bash
pnpm add --filter @radio/api multer
pnpm add --filter @radio/api -D @types/multer
```

---

### Step 3: Create Audio Utilities

**File:** `apps/admin/lib/audio-utils.ts` (NEW)

```typescript
/**
 * Get audio duration from File object
 */
export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio metadata'));
    });

    audio.src = url;
  });
}

/**
 * Validate audio file type
 */
export function validateAudioFile(file: File): boolean {
  const validTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/flac',
    'audio/ogg',
    'audio/aac',
  ];

  return validTypes.includes(file.type);
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size in bytes to human-readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
```

---

### Step 4: Create Upload Page

**File:** `apps/admin/app/dashboard/music/upload/page.tsx` (NEW)

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAudioDuration, validateAudioFile, formatFileSize } from '@/lib/audio-utils';

export default function MusicUploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    title: '',
    artist: '',
    album: '',
    genre_id: '',
    mood: '',
    tempo: '',
    energy_level: 5,
    license_type: 'unknown',
    attribution_required: false,
    attribution_text: '',
    suitable_for_time: [] as string[],
    suitable_for_programs: [] as string[],
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!validateAudioFile(selectedFile)) {
      setError('Please select a valid audio file (MP3, WAV, FLAC, etc.)');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Auto-populate title from filename (remove extension)
    if (!metadata.title) {
      const titleFromFile = selectedFile.name.replace(/\.[^/.]+$/, '');
      setMetadata({ ...metadata, title: titleFromFile });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!metadata.title.trim()) {
      setError('Title is required');
      return;
    }

    setUploading(true);

    try {
      // Step 1: Get audio duration
      const duration = await getAudioDuration(file);

      // Step 2: Upload file to API
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadRes.json();

      if (uploadData.duplicate) {
        setError(
          `This file already exists: "${uploadData.existingTrack.title}" by ${uploadData.existingTrack.artist || 'Unknown'}`
        );
        setUploading(false);
        return;
      }

      // Step 3: Create track metadata
      const trackData = {
        ...metadata,
        duration_sec: duration,
        storage_path: uploadData.storagePath,
        file_hash: uploadData.fileHash,
        file_format: file.type,
        genre_id: metadata.genre_id || null,
      };

      const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackData),
      });

      if (!createRes.ok) {
        throw new Error('Failed to create track');
      }

      // Success! Redirect to music library
      router.push('/dashboard/music');
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Upload Music Track</h1>
        <p className="mt-2 text-gray-600">
          Add a new music track to the library
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* File Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Audio File *
          </label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name} ({formatFileSize(file.size)})
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            value={metadata.title}
            onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Artist */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Artist
          </label>
          <input
            type="text"
            value={metadata.artist}
            onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Album */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Album
          </label>
          <input
            type="text"
            value={metadata.album}
            onChange={(e) => setMetadata({ ...metadata, album: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Mood */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Mood
          </label>
          <select
            value={metadata.mood}
            onChange={(e) => setMetadata({ ...metadata, mood: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Mood</option>
            <option value="energetic">Energetic</option>
            <option value="calm">Calm</option>
            <option value="uplifting">Uplifting</option>
            <option value="melancholic">Melancholic</option>
            <option value="mysterious">Mysterious</option>
            <option value="playful">Playful</option>
          </select>
        </div>

        {/* Tempo */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Tempo
          </label>
          <select
            value={metadata.tempo}
            onChange={(e) => setMetadata({ ...metadata, tempo: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Tempo</option>
            <option value="slow">Slow (60-90 BPM)</option>
            <option value="medium">Medium (90-120 BPM)</option>
            <option value="fast">Fast (120-140 BPM)</option>
            <option value="very_fast">Very Fast (140+ BPM)</option>
          </select>
        </div>

        {/* Energy Level */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Energy Level: {metadata.energy_level}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={metadata.energy_level}
            onChange={(e) => setMetadata({ ...metadata, energy_level: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Low Energy</span>
            <span>High Energy</span>
          </div>
        </div>

        {/* License Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            License Type
          </label>
          <select
            value={metadata.license_type}
            onChange={(e) => setMetadata({ ...metadata, license_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="unknown">Unknown</option>
            <option value="royalty_free">Royalty Free</option>
            <option value="creative_commons">Creative Commons</option>
            <option value="purchased">Purchased License</option>
            <option value="original">Original Work</option>
          </select>
        </div>

        {/* Attribution */}
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={metadata.attribution_required}
              onChange={(e) => setMetadata({ ...metadata, attribution_required: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-gray-700">
              Attribution Required
            </span>
          </label>
        </div>

        {metadata.attribution_required && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Attribution Text
            </label>
            <textarea
              value={metadata.attribution_text}
              onChange={(e) => setMetadata({ ...metadata, attribution_text: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Music by Artist Name under CC BY 4.0"
            />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Track'}
          </button>

          <Link
            href="/dashboard/music"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
```

---

### Step 5: Enhance Music Listing Page

**File:** `apps/admin/app/dashboard/music/page.tsx` (ENHANCE EXISTING)

Add these features to the existing page:

1. **Search and Filters** (add above the table)
2. **Edit Button** for each track
3. **Delete Button** with confirmation
4. **Audio Preview** player

```typescript
// Add this section above the existing table:

{/* Search and Filters */}
<div className="mb-6 flex gap-4 items-end">
  <div className="flex-1">
    <label className="block text-sm font-semibold text-gray-700 mb-2">
      Search
    </label>
    <input
      type="text"
      placeholder="Search by title or artist..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">
      Mood
    </label>
    <select
      value={moodFilter}
      onChange={(e) => setMoodFilter(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">All Moods</option>
      <option value="energetic">Energetic</option>
      <option value="calm">Calm</option>
      <option value="uplifting">Uplifting</option>
      <option value="melancholic">Melancholic</option>
    </select>
  </div>

  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">
      Status
    </label>
    <select
      value={statusFilter}
      onChange={(e) => setStatusFilter(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">All</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="reviewed">Reviewed</option>
      <option value="unreviewed">Unreviewed</option>
    </select>
  </div>
</div>

// Add "Actions" column to table with Edit/Delete buttons:

<td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
  <Link
    href={`/dashboard/music/${track.id}`}
    className="text-blue-600 hover:text-blue-900"
  >
    Edit
  </Link>
  <button
    onClick={() => handleDelete(track)}
    className="text-red-600 hover:text-red-900"
  >
    Delete
  </button>
</td>

// Add delete handler:

async function handleDelete(track: MusicTrack) {
  if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/tracks/${track.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error('Delete failed');
    }

    // Reload tracks
    loadTracks();
  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete track');
  }
}
```

---

### Step 6: Create Track Edit Page

**File:** `apps/admin/app/dashboard/music/[id]/page.tsx` (NEW)

```typescript
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import TrackEditForm from './track-edit-form';

export default async function TrackEditPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Fetch track data
  const { data: track, error } = await supabase
    .from('music_tracks')
    .select('*, genre:music_genres(id, name)')
    .eq('id', params.id)
    .single();

  if (error || !track) {
    notFound();
  }

  // Get signed URL for audio preview
  let audioUrl = null;
  if (track.storage_path) {
    const { data: signedUrl } = await supabase.storage
      .from('audio-assets')
      .createSignedUrl(track.storage_path, 3600);

    audioUrl = signedUrl?.signedUrl || null;
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Track</h1>
      <TrackEditForm track={{ ...track, audioUrl }} />
    </div>
  );
}
```

**File:** `apps/admin/app/dashboard/music/[id]/track-edit-form.tsx` (NEW)

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDuration } from '@/lib/audio-utils';

export default function TrackEditForm({ track }: { track: any }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: track.title,
    artist: track.artist || '',
    album: track.album || '',
    mood: track.mood || '',
    tempo: track.tempo || '',
    energy_level: track.energy_level || 5,
    license_type: track.license_type || 'unknown',
    attribution_required: track.attribution_required || false,
    attribution_text: track.attribution_text || '',
    active: track.active,
    reviewed: track.reviewed,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Update failed');
      }

      router.push('/dashboard/music');
    } catch (err: any) {
      console.error('Update error:', err);
      setError(err.message || 'Update failed');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/tracks/${track.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      router.push('/dashboard/music');
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete track');
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Audio Preview */}
      {track.audioUrl && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-700 mb-2">Audio Preview</h3>
          <audio controls src={track.audioUrl} className="w-full" />
          <p className="text-sm text-gray-600 mt-2">
            Duration: {formatDuration(track.duration_sec)}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Artist */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Artist
          </label>
          <input
            type="text"
            value={formData.artist}
            onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Album */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Album
          </label>
          <input
            type="text"
            value={formData.album}
            onChange={(e) => setFormData({ ...formData, album: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Mood */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Mood
          </label>
          <select
            value={formData.mood}
            onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Mood</option>
            <option value="energetic">Energetic</option>
            <option value="calm">Calm</option>
            <option value="uplifting">Uplifting</option>
            <option value="melancholic">Melancholic</option>
            <option value="mysterious">Mysterious</option>
            <option value="playful">Playful</option>
          </select>
        </div>

        {/* Energy Level */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Energy Level: {formData.energy_level}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={formData.energy_level}
            onChange={(e) => setFormData({ ...formData, energy_level: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Status Toggles */}
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-gray-700">Active</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.reviewed}
              onChange={(e) => setFormData({ ...formData, reviewed: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-gray-700">Reviewed</span>
          </label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          <Link
            href="/dashboard/music"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </Link>

          <button
            type="button"
            onClick={handleDelete}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 ml-auto"
          >
            Delete Track
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Database Notes

The existing schema from Task M1 includes a `file_hash` column that wasn't in the original spec. Make sure to add it:

```sql
-- Migration may be needed:
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_music_tracks_file_hash ON music_tracks(file_hash);
```

Check if this column exists. If not, create a quick migration file.

---

## Acceptance Criteria

### Functional Requirements
- [ ] Upload audio files (MP3, WAV, FLAC, etc.) via `/dashboard/music/upload`
- [ ] Auto-extract duration from audio file
- [ ] Add metadata (title, artist, album, mood, tempo, energy)
- [ ] License information (type, attribution)
- [ ] Duplicate detection via file hash (SHA-256)
- [ ] Search tracks by title/artist on listing page
- [ ] Filter by mood and status
- [ ] Preview audio playback on edit page
- [ ] Edit track metadata at `/dashboard/music/[id]`
- [ ] Delete tracks (removes from storage and DB)
- [ ] Tracks start as inactive/unreviewed (require manual review)

### Quality Requirements
- [ ] File upload with progress indication
- [ ] Error handling for invalid files
- [ ] Responsive design (Tailwind)
- [ ] Consistent with existing admin UI styles
- [ ] Proper TypeScript types
- [ ] Server-side rendering where appropriate

### Manual Verification
1. [ ] Upload music file successfully
2. [ ] Try uploading same file twice (see duplicate warning)
3. [ ] Edit track metadata
4. [ ] Search for track by title
5. [ ] Filter by mood
6. [ ] Preview track audio on edit page
7. [ ] Toggle active/reviewed status
8. [ ] Delete track (verify storage file deleted)

---

## Files Created/Modified

### NEW Files:
- `apps/admin/lib/audio-utils.ts` - Audio helper functions
- `apps/admin/app/dashboard/music/upload/page.tsx` - Upload UI
- `apps/admin/app/dashboard/music/[id]/page.tsx` - Edit page (server)
- `apps/admin/app/dashboard/music/[id]/track-edit-form.tsx` - Edit form (client)

### MODIFIED Files:
- `apps/api/src/music/music-service.ts` - Add upload/CRUD methods
- `apps/api/src/music/music-routes.ts` - Add upload/CRUD endpoints
- `apps/admin/app/dashboard/music/page.tsx` - Add search/filters/actions
- `apps/api/package.json` - Add multer dependency

### MAYBE NEEDED:
- `infra/migrations/0XX_add_file_hash_to_music_tracks.sql` - If file_hash column missing

---

## Next Steps After A12

**What this task provides:**

1. **Full music library management** - Upload, edit, delete tracks
2. **Metadata organization** - Mood, tempo, energy for smart scheduling
3. **License tracking** - Attribution compliance
4. **Audio preview** - Review tracks before activation

**Future tasks can now:**
- Use music library in segment generation (background music)
- Schedule tracks based on mood/time-of-day
- Play tracks during broadcast (playout)
- Generate reports on track usage

---

## Testing Commands

```bash
# Install new dependency
pnpm add --filter @radio/api multer
pnpm add --filter @radio/api -D @types/multer

# Run typecheck
pnpm --filter @radio/api typecheck
pnpm --filter @radio/admin typecheck

# Build
pnpm --filter @radio/api build
pnpm --filter @radio/admin build

# Test API upload endpoint
curl -X POST http://localhost:8000/music/upload \
  -F "file=@/path/to/test.mp3"

# Run admin dev server
pnpm --filter @radio/admin dev
```

---

## Implementation Priority

1. **Step 1-2:** Backend (API routes + service methods) - Core upload functionality
2. **Step 3:** Audio utils - Helper functions for client
3. **Step 4:** Upload page - Primary feature
4. **Step 5:** Enhance listing - Search/filter/delete
5. **Step 6:** Edit page - Complete CRUD

Estimate: 5-6 hours total
- Backend: 2 hours
- Upload UI: 2 hours
- Edit UI: 1.5 hours
- Testing/polish: 30 min
