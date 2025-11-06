'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface DJFormProps {
  dj?: any;
  voices: any[];
  mode: 'create' | 'edit';
}

const SPEAKING_STYLES = [
  'formal',
  'casual',
  'energetic',
  'relaxed',
  'authoritative',
  'friendly',
];

const ENERGY_LEVELS = ['low', 'medium', 'high'];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function DJForm({ dj, voices, mode }: DJFormProps) {
  const [name, setName] = useState(dj?.name || '');
  const [slug, setSlug] = useState(dj?.slug || '');
  const [bioShort, setBioShort] = useState(dj?.bio_short || '');
  const [bioLong, setBioLong] = useState(dj?.bio_long || '');
  const [personalityTraits, setPersonalityTraits] = useState(
    dj?.personality_traits?.join(', ') || ''
  );
  const [speakingStyle, setSpeakingStyle] = useState(dj?.speaking_style || 'casual');
  const [voiceId, setVoiceId] = useState(dj?.voice_id || '');
  const [speechSpeed, setSpeechSpeed] = useState(dj?.speech_speed || 1.0);
  const [energyLevel, setEnergyLevel] = useState(dj?.energy_level || 'medium');
  const [specializations, setSpecializations] = useState(
    dj?.specializations?.join(', ') || ''
  );
  const [preferredTopics, setPreferredTopics] = useState(
    dj?.preferred_topics?.join(', ') || ''
  );
  const [primaryLang, setPrimaryLang] = useState(dj?.primary_lang || 'en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Auto-generate slug from name
  useEffect(() => {
    if (mode === 'create' && name) {
      setSlug(generateSlug(name));
    }
  }, [name, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Convert comma-separated strings to arrays
    const traitsArray = personalityTraits
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    const specializationsArray = specializations
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    const topicsArray = preferredTopics
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    const djData: any = {
      name,
      slug,
      bio_short: bioShort,
      bio_long: bioLong || null,
      personality_traits: traitsArray.length > 0 ? traitsArray : null,
      speaking_style: speakingStyle,
      voice_id: voiceId,
      speech_speed: parseFloat(speechSpeed.toString()),
      energy_level: energyLevel,
      specializations: specializationsArray.length > 0 ? specializationsArray : null,
      preferred_topics: topicsArray.length > 0 ? topicsArray : null,
      primary_lang: primaryLang,
    };

    try {
      if (mode === 'create') {
        const { error: insertError } = await supabase
          .from('djs')
          .insert([djData]);

        if (insertError) throw insertError;

        router.push('/dashboard/djs');
      } else {
        const { error: updateError } = await supabase
          .from('djs')
          .update(djData)
          .eq('id', dj.id);

        if (updateError) throw updateError;

        router.push('/dashboard/djs');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this DJ?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('djs')
        .delete()
        .eq('id', dj.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/djs');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            DJ Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="e.g., Nova Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Slug *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md font-mono"
            placeholder="nova-chen"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Auto-generated from name (can be edited)
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Short Bio (1-2 sentences) *
        </label>
        <textarea
          required
          rows={2}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="A brief introduction to the DJ..."
          value={bioShort}
          onChange={(e) => setBioShort(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Full Biography (Optional)
        </label>
        <textarea
          rows={6}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Full background story, career history, personality details..."
          value={bioLong}
          onChange={(e) => setBioLong(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Voice *
          </label>
          <select
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            <option value="">Select a voice...</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.locale})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Speech Speed: {speechSpeed}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            className="mt-1 block w-full"
            value={speechSpeed}
            onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
          />
          <p className="mt-1 text-xs text-gray-500">
            0.5 = slow, 1.0 = normal, 2.0 = fast
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Speaking Style
          </label>
          <select
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={speakingStyle}
            onChange={(e) => setSpeakingStyle(e.target.value)}
          >
            {SPEAKING_STYLES.map((style) => (
              <option key={style} value={style}>
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Energy Level
          </label>
          <select
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(e.target.value)}
          >
            {ENERGY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Personality Traits (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="enthusiastic, knowledgeable, witty, curious"
          value={personalityTraits}
          onChange={(e) => setPersonalityTraits(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          Character traits that define this DJ's personality
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Specializations (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="space exploration, climate science, cultural history"
          value={specializations}
          onChange={(e) => setSpecializations(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          Areas of expertise for content generation
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Preferred Topics (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="technology, arts, community events"
          value={preferredTopics}
          onChange={(e) => setPreferredTopics(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          Topics this DJ covers well
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Primary Language
        </label>
        <select
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={primaryLang}
          onChange={(e) => setPrimaryLang(e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      <div className="flex justify-between">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
