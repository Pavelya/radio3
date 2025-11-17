'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const CONVERSATION_FORMATS = {
  interview: {
    name: 'Interview',
    description: 'One-on-one conversation with expert guest',
    minParticipants: 2,
    maxParticipants: 2,
    templates: ['standard', 'news', 'feature'],
  },
  panel: {
    name: 'Panel Discussion',
    description: 'Multiple experts discussing a topic',
    minParticipants: 3,
    maxParticipants: 5,
    templates: ['roundtable', 'debate'],
  },
  dialogue: {
    name: 'DJ Dialogue',
    description: 'Two DJs chatting about a topic',
    minParticipants: 2,
    maxParticipants: 2,
    templates: ['casual', 'informative'],
  },
};

export default function CreateConversationPage() {
  const router = useRouter();
  const supabase = createClient();
  const [format, setFormat] = useState<string>('interview');
  const [template, setTemplate] = useState<string>('standard');
  const [topic, setTopic] = useState<string>('');
  const [generateGuests, setGenerateGuests] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);

    try {
      // First, check if we have enough DJs for the selected format
      const { count: djCount } = await supabase
        .from('djs')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const requiredDJs = format === 'panel' ? 3 : 2;

      if (!djCount || djCount < requiredDJs) {
        throw new Error(
          `You need at least ${requiredDJs} active DJs for ${format} format. ` +
          `You currently have ${djCount || 0}. Please create more DJs first.`
        );
      }

      // Create segment
      const { data: segment, error: segmentError } = await supabase
        .from('segments')
        .insert({
          program_id: '00000000-0000-0000-0000-000000000001', // Default program for manual segments
          slot_type: format === 'interview' ? 'interview' : 'panel',
          conversation_format: format,
          participant_count: format === 'interview' ? 2 : (format === 'panel' ? 3 : 2),
          state: 'queued',
          lang: 'en',
        })
        .select()
        .single();

      if (segmentError) throw segmentError;

      // Get an active DJ as host
      const { data: djs, error: djError } = await supabase
        .from('djs')
        .select('*')
        .eq('is_active', true)
        .limit(1);

      if (djError) {
        throw new Error(`Failed to fetch DJs: ${djError.message}`);
      }

      const hostDJ = djs?.[0];

      if (!hostDJ) {
        throw new Error('No active DJs found. Please create at least 2 DJs first.');
      }

      // Add host participant
      const { error: hostError } = await supabase.from('conversation_participants').insert({
        segment_id: segment.id,
        dj_id: hostDJ.id,
        role: 'host',
        speaking_order: 1,
      });

      if (hostError) {
        throw new Error(`Failed to add host participant: ${hostError.message}`);
      }

      // Add guest/panelists
      if (format === 'interview') {
        // For interviews, add one guest
        const { data: guestDJs } = await supabase
          .from('djs')
          .select('*')
          .eq('is_active', true)
          .neq('id', hostDJ.id)
          .limit(1);

        const guestDJ = guestDJs?.[0];

        if (!guestDJ) {
          throw new Error('Not enough DJs for interview format. Need at least 2 active DJs.');
        }

        const { error: guestError } = await supabase.from('conversation_participants').insert({
          segment_id: segment.id,
          dj_id: guestDJ.id,
          role: 'guest',
          speaking_order: 2,
        });

        if (guestError) {
          throw new Error(`Failed to add guest participant: ${guestError.message}`);
        }
      } else if (format === 'panel') {
        // Add 2-3 panelists
        const { data: otherDJs } = await supabase
          .from('djs')
          .select('*')
          .eq('is_active', true)
          .neq('id', hostDJ.id)
          .limit(3);

        if (!otherDJs || otherDJs.length < 2) {
          throw new Error('Not enough DJs for panel format. Need at least 3 active DJs.');
        }

        for (let i = 0; i < otherDJs.length; i++) {
          const { error: panelistError } = await supabase.from('conversation_participants').insert({
            segment_id: segment.id,
            dj_id: otherDJs[i].id,
            role: 'panelist',
            speaking_order: i + 2,
          });

          if (panelistError) {
            throw new Error(`Failed to add panelist ${i + 1}: ${panelistError.message}`);
          }
        }
      } else if (format === 'dialogue') {
        // For dialogue, add one other DJ
        const { data: otherDJs } = await supabase
          .from('djs')
          .select('*')
          .eq('is_active', true)
          .neq('id', hostDJ.id)
          .limit(1);

        const otherDJ = otherDJs?.[0];

        if (!otherDJ) {
          throw new Error('Not enough DJs for dialogue format. Need at least 2 active DJs.');
        }

        const { error: coHostError } = await supabase.from('conversation_participants').insert({
          segment_id: segment.id,
          dj_id: otherDJ.id,
          role: 'co-host',
          speaking_order: 2,
        });

        if (coHostError) {
          throw new Error(`Failed to add co-host participant: ${coHostError.message}`);
        }
      }

      // Enqueue generation job
      const { error: jobError } = await supabase.rpc('enqueue_job', {
        p_job_type: 'segment_make',
        p_payload: {
          segment_id: segment.id,
          topic: topic,
          template: template,
          generate_guest: generateGuests,
        },
        p_priority: 5,
      });

      if (jobError) {
        throw new Error(`Failed to enqueue generation job: ${jobError.message}`);
      }

      router.push(`/dashboard/segments/${segment.id}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);

      // Extract error message from various error types
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Supabase errors or other objects
        const err = error as any;
        errorMessage = err.message || err.error || err.error_description || JSON.stringify(error);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      alert(`Failed to create conversation: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedFormat = CONVERSATION_FORMATS[format as keyof typeof CONVERSATION_FORMATS];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Multi-Speaker Segment</h1>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Conversation Format
          </label>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(CONVERSATION_FORMATS).map(([key, fmt]) => (
              <button
                key={key}
                onClick={() => setFormat(key)}
                className={`p-4 border-2 rounded-lg text-left transition ${
                  format === key
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold mb-1">{fmt.name}</div>
                <div className="text-xs text-gray-600">{fmt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {selectedFormat.templates.map((tmpl) => (
              <option key={tmpl} value={tmpl}>
                {tmpl.charAt(0).toUpperCase() + tmpl.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Mars Colony Expansion Plans"
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        {/* Guest Generation Option */}
        {format === 'interview' && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="generate-guests"
              checked={generateGuests}
              onChange={(e) => setGenerateGuests(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="generate-guests" className="text-sm text-gray-700">
              Auto-generate guest character using AI
            </label>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-800">
            <strong>Format:</strong> {selectedFormat.name}
            <br />
            <strong>Participants:</strong> {selectedFormat.minParticipants}
            {selectedFormat.maxParticipants !== selectedFormat.minParticipants &&
              `-${selectedFormat.maxParticipants}`}
            <br />
            <strong>Note:</strong> {selectedFormat.description}
          </div>
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={loading || !topic}
          className={`w-full py-3 rounded-lg font-medium ${
            loading || !topic
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Creating...' : 'Create Conversation Segment'}
        </button>
      </div>
    </div>
  );
}
