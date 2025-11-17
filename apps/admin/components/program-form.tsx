'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface ProgramFormProps {
  program?: any;
  djs: any[];
  formatClocks: any[];
  mode: 'create' | 'edit';
}

const GENRE_OPTIONS = [
  'news',
  'culture',
  'talk',
  'music',
  'sports',
  'technology',
  'arts',
  'science',
];

const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning (6am-12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm-6pm)' },
  { value: 'evening', label: 'Evening (6pm-10pm)' },
  { value: 'night', label: 'Night (10pm-6am)' },
];

const DAY_OPTIONS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export default function ProgramForm({
  program,
  djs,
  formatClocks,
  mode,
}: ProgramFormProps) {
  const [name, setName] = useState(program?.name || '');
  const [djIds, setDjIds] = useState<string[]>(
    program?.djIds || (program?.dj_id ? [program.dj_id] : [])
  );
  const [conversationFormat, setConversationFormat] = useState(
    program?.conversation_format || ''
  );
  const [formatClockId, setFormatClockId] = useState(program?.format_clock_id || '');
  const [description, setDescription] = useState(program?.description || '');
  const [genre, setGenre] = useState(program?.genre || '');
  const [preferredTimeOfDay, setPreferredTimeOfDay] = useState(
    program?.preferred_time_of_day || ''
  );
  const [preferredDays, setPreferredDays] = useState<string[]>(
    program?.preferred_days || []
  );
  const [active, setActive] = useState(program?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleDayToggle = (day: string) => {
    if (preferredDays.includes(day)) {
      setPreferredDays(preferredDays.filter((d) => d !== day));
    } else {
      setPreferredDays([...preferredDays, day]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate required fields
    if (!name.trim()) {
      setError('Program name is required');
      setLoading(false);
      return;
    }

    if (djIds.length === 0) {
      setError('Please select at least one DJ');
      setLoading(false);
      return;
    }

    if (djIds.length > 1 && !conversationFormat) {
      setError('Please select a conversation format for multi-DJ programs');
      setLoading(false);
      return;
    }

    if (!formatClockId) {
      setError('Please select a format clock');
      setLoading(false);
      return;
    }

    const programData: any = {
      name: name.trim(),
      format_clock_id: formatClockId,
      description: description.trim() || null,
      genre: genre || null,
      preferred_time_of_day: preferredTimeOfDay || null,
      preferred_days: preferredDays.length > 0 ? preferredDays : null,
      conversation_format: djIds.length > 1 ? conversationFormat : null,
      active,
    };

    try {
      if (mode === 'create') {
        // Insert program
        const { data: newProgram, error: insertError } = await supabase
          .from('programs')
          .insert([programData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Insert program_djs relationships
        const programDjsData = djIds.map((djId, index) => ({
          program_id: newProgram.id,
          dj_id: djId,
          role: index === 0 ? 'host' : (djIds.length === 2 ? 'guest' : 'panelist'),
          speaking_order: index + 1,
        }));

        const { error: djsError } = await supabase
          .from('program_djs')
          .insert(programDjsData);

        if (djsError) throw djsError;

        router.push('/dashboard/programs');

      } else {
        // Update program
        const { error: updateError } = await supabase
          .from('programs')
          .update(programData)
          .eq('id', program.id);

        if (updateError) throw updateError;

        // Delete existing program_djs
        const { error: deleteError } = await supabase
          .from('program_djs')
          .delete()
          .eq('program_id', program.id);

        if (deleteError) throw deleteError;

        // Insert new program_djs relationships
        const programDjsData = djIds.map((djId, index) => ({
          program_id: program.id,
          dj_id: djId,
          role: index === 0 ? 'host' : (djIds.length === 2 ? 'guest' : 'panelist'),
          speaking_order: index + 1,
        }));

        const { error: djsError } = await supabase
          .from('program_djs')
          .insert(programDjsData);

        if (djsError) throw djsError;

        router.push('/dashboard/programs');
      }
    } catch (err: any) {
      console.error('Program save error:', err);
      setError(err.message || 'Failed to save program');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this program? This action cannot be undone.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('programs')
        .delete()
        .eq('id', program.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/programs');
    } catch (err: any) {
      console.error('Program delete error:', err);
      setError(err.message || 'Failed to delete program');
      setLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (mode !== 'edit') return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('programs')
        .update({ active: !active })
        .eq('id', program.id);

      if (updateError) throw updateError;

      setActive(!active);
      setLoading(false);
    } catch (err: any) {
      console.error('Toggle active error:', err);
      setError(err.message || 'Failed to update status');
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

      {/* Program Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Program Name *
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., Morning News Hour"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* DJ Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          DJ(s) *
          <span className="text-xs text-gray-500 ml-2">
            Select multiple for conversations
          </span>
        </label>

        {/* Multi-select checkboxes */}
        <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-md p-3">
          {djs.length === 0 ? (
            <p className="text-sm text-yellow-600">
              No DJs available. Please create a DJ first.
            </p>
          ) : (
            <div className="space-y-2">
              {djs.map((dj) => (
                <label
                  key={dj.id}
                  className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                    djIds.includes(dj.id)
                      ? 'bg-blue-50 border border-blue-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={djIds.includes(dj.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setDjIds([...djIds, dj.id]);
                      } else {
                        setDjIds(djIds.filter(id => id !== dj.id));
                      }
                    }}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-900">
                    {dj.name}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{dj.slug}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="mt-1 text-xs text-gray-500">
          {djIds.length === 0 && 'Select at least one DJ'}
          {djIds.length === 1 && '1 DJ selected (monologue format)'}
          {djIds.length > 1 && `${djIds.length} DJs selected (conversation format)`}
        </p>
      </div>

      {/* Conversation Format Selection (conditional) */}
      {djIds.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Conversation Format *
          </label>
          <select
            required={djIds.length > 1}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={conversationFormat}
            onChange={(e) => setConversationFormat(e.target.value)}
          >
            <option value="">Select conversation format...</option>
            {djIds.length === 2 && (
              <>
                <option value="interview">Interview (Q&A with expert guest)</option>
                <option value="dialogue">DJ Dialogue (Two DJs chatting)</option>
              </>
            )}
            {djIds.length >= 3 && (
              <>
                <option value="panel">Panel Discussion (Multiple experts)</option>
                <option value="debate">Debate (Opposing viewpoints)</option>
              </>
            )}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {djIds.length === 2 && 'Interview: One host interviews a guest. Dialogue: Two DJs discuss a topic.'}
            {djIds.length >= 3 && 'Panel: Multiple experts discuss. Debate: Opposing viewpoints clash.'}
          </p>
        </div>
      )}

      {/* Format Clock Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Format Clock *
        </label>
        <select
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          value={formatClockId}
          onChange={(e) => setFormatClockId(e.target.value)}
        >
          <option value="">Select a format clock...</option>
          {formatClocks.map((clock) => (
            <option key={clock.id} value={clock.id}>
              {clock.name}
              {clock.description && ` - ${clock.description}`}
            </option>
          ))}
        </select>
        {formatClocks.length === 0 && (
          <p className="mt-1 text-sm text-yellow-600">
            No format clocks available. Please create a format clock first.
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Brief description of the program..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Genre */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Genre</label>
        <select
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="">Select genre...</option>
          {GENRE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Scheduling Hints */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Scheduling Hints
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          These preferences help the scheduler determine optimal broadcast times.
        </p>

        {/* Preferred Time of Day */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preferred Time of Day
          </label>
          <div className="space-y-2">
            <label className="inline-flex items-center mr-6">
              <input
                type="radio"
                name="timeOfDay"
                value=""
                checked={preferredTimeOfDay === ''}
                onChange={(e) => setPreferredTimeOfDay(e.target.value)}
                className="form-radio h-4 w-4 text-blue-600"
              />
              <span className="ml-2 text-sm text-gray-700">Any time</span>
            </label>
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <label key={option.value} className="inline-flex items-center mr-6">
                <input
                  type="radio"
                  name="timeOfDay"
                  value={option.value}
                  checked={preferredTimeOfDay === option.value}
                  onChange={(e) => setPreferredTimeOfDay(e.target.value)}
                  className="form-radio h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preferred Days */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preferred Days
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Leave all unchecked for any day
          </p>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <label
                key={day}
                className={`inline-flex items-center px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                  preferredDays.includes(day)
                    ? 'bg-blue-100 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={preferredDays.includes(day)}
                  onChange={() => handleDayToggle(day)}
                  className="form-checkbox h-4 w-4 text-blue-600 mr-2"
                />
                <span className="text-sm font-medium capitalize">{day}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Active Status */}
      <div className="border-t pt-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="form-checkbox h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium text-gray-700">
            Active (program is available for scheduling)
          </span>
        </label>
      </div>

      {/* Form Actions */}
      <div className="flex justify-between border-t pt-6">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create Program' : 'Update Program'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={loading}
              className="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600 disabled:opacity-50"
            >
              {active ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Program
          </button>
        )}
      </div>
    </form>
  );
}
