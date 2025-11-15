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
            <option value="cc0">CC0 (Public Domain)</option>
            <option value="cc-by">CC BY</option>
            <option value="cc-by-sa">CC BY-SA</option>
            <option value="cc-by-nc">CC BY-NC</option>
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
