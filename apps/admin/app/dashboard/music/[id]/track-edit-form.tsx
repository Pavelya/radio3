'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDuration } from '@/lib/audio-utils';

interface TrackEditFormProps {
  track: any;
}

export default function TrackEditForm({ track }: TrackEditFormProps) {
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

        {/* Tempo */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Tempo
          </label>
          <select
            value={formData.tempo}
            onChange={(e) => setFormData({ ...formData, tempo: e.target.value })}
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
            value={formData.license_type}
            onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
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
              checked={formData.attribution_required}
              onChange={(e) => setFormData({ ...formData, attribution_required: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-gray-700">
              Attribution Required
            </span>
          </label>
        </div>

        {formData.attribution_required && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Attribution Text
            </label>
            <textarea
              value={formData.attribution_text}
              onChange={(e) => setFormData({ ...formData, attribution_text: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Music by Artist Name under CC BY 4.0"
            />
          </div>
        )}

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
