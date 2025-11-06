'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FormatSlotData {
  id?: string;
  slot_type: string;
  duration_sec: number;
  order_index: number;
}

interface FormatClockFormProps {
  formatClock?: any;
  mode: 'create' | 'edit';
}

const SLOT_TYPES = [
  { value: 'news', label: 'News', color: 'bg-red-100 border-red-300' },
  { value: 'culture', label: 'Culture', color: 'bg-purple-100 border-purple-300' },
  { value: 'tech', label: 'Tech', color: 'bg-blue-100 border-blue-300' },
  { value: 'interview', label: 'Interview', color: 'bg-green-100 border-green-300' },
  { value: 'music', label: 'Music', color: 'bg-yellow-100 border-yellow-300' },
  { value: 'station_id', label: 'Station ID', color: 'bg-gray-100 border-gray-300' },
  { value: 'weather', label: 'Weather', color: 'bg-cyan-100 border-cyan-300' },
];

function SortableSlot({
  slot,
  index,
  onUpdate,
  onDelete,
}: {
  slot: FormatSlotData;
  index: number;
  onUpdate: (index: number, field: string, value: any) => void;
  onDelete: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `slot-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const slotTypeInfo = SLOT_TYPES.find((t) => t.value === slot.slot_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 border rounded mb-2 ${slotTypeInfo?.color || 'bg-white border-gray-300'}`}
    >
      <div className="flex items-center gap-4">
        <div
          {...attributes}
          {...listeners}
          className="cursor-move text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Slot Type
            </label>
            <select
              value={slot.slot_type}
              onChange={(e) => onUpdate(index, 'slot_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {SLOT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duration (seconds)
            </label>
            <input
              type="number"
              min="1"
              value={slot.duration_sec}
              onChange={(e) =>
                onUpdate(index, 'duration_sec', parseInt(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-end">
            <div className="text-sm text-gray-600 pb-2">
              {Math.floor(slot.duration_sec / 60)}:
              {(slot.duration_sec % 60).toString().padStart(2, '0')} min
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-red-600 hover:text-red-800 font-bold text-xl px-2"
          title="Delete slot"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function FormatClockForm({
  formatClock,
  mode,
}: FormatClockFormProps) {
  const [name, setName] = useState(formatClock?.name || '');
  const [description, setDescription] = useState(formatClock?.description || '');
  const [slots, setSlots] = useState<FormatSlotData[]>(
    formatClock?.slots?.length > 0
      ? formatClock.slots
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((slot: any) => ({
            id: slot.id,
            slot_type: slot.slot_type,
            duration_sec: slot.duration_sec,
            order_index: slot.order_index,
          }))
      : [{ slot_type: 'station_id', duration_sec: 30, order_index: 0 }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const totalDuration = slots.reduce(
    (sum, slot) => sum + (slot.duration_sec || 0),
    0
  );
  const isValidDuration = totalDuration === 3600;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSlots((items) => {
      const oldIndex = items.findIndex((_, i) => `slot-${i}` === active.id);
      const newIndex = items.findIndex((_, i) => `slot-${i}` === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function addSlot() {
    setSlots([
      ...slots,
      {
        slot_type: 'news',
        duration_sec: 300,
        order_index: slots.length,
      },
    ]);
  }

  function updateSlot(index: number, field: string, value: any) {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  }

  function deleteSlot(index: number) {
    if (slots.length === 1) {
      setError('Format clock must have at least one slot');
      return;
    }
    setSlots(slots.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate required fields
    if (!name.trim()) {
      setError('Clock name is required');
      setLoading(false);
      return;
    }

    if (slots.length === 0) {
      setError('At least one slot is required');
      setLoading(false);
      return;
    }

    if (!isValidDuration) {
      setError(
        `Total duration must be exactly 60 minutes (3600 seconds). Current: ${totalDuration} seconds`
      );
      setLoading(false);
      return;
    }

    try {
      if (mode === 'create') {
        // Insert format clock
        const { data: clockData, error: clockError } = await supabase
          .from('format_clocks')
          .insert([
            {
              name: name.trim(),
              description: description.trim() || null,
              total_duration_sec: totalDuration,
            },
          ])
          .select()
          .single();

        if (clockError) throw clockError;

        // Insert slots
        const slotsData = slots.map((slot, index) => ({
          format_clock_id: clockData.id,
          slot_type: slot.slot_type,
          duration_sec: slot.duration_sec,
          order_index: index,
        }));

        const { error: slotsError } = await supabase
          .from('format_slots')
          .insert(slotsData);

        if (slotsError) throw slotsError;

        router.push('/dashboard/format-clocks');
      } else {
        // Update format clock
        const { error: clockError } = await supabase
          .from('format_clocks')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            total_duration_sec: totalDuration,
          })
          .eq('id', formatClock.id);

        if (clockError) throw clockError;

        // Delete existing slots
        const { error: deleteError } = await supabase
          .from('format_slots')
          .delete()
          .eq('format_clock_id', formatClock.id);

        if (deleteError) throw deleteError;

        // Insert new slots
        const slotsData = slots.map((slot, index) => ({
          format_clock_id: formatClock.id,
          slot_type: slot.slot_type,
          duration_sec: slot.duration_sec,
          order_index: index,
        }));

        const { error: slotsError } = await supabase
          .from('format_slots')
          .insert(slotsData);

        if (slotsError) throw slotsError;

        router.push('/dashboard/format-clocks');
      }
    } catch (err: any) {
      console.error('Format clock save error:', err);
      setError(err.message || 'Failed to save format clock');
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        'Are you sure you want to delete this format clock? This action cannot be undone.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      // Check if used by programs
      const { data: programs, error: programsError } = await supabase
        .from('programs')
        .select('id')
        .eq('format_clock_id', formatClock.id);

      if (programsError) throw programsError;

      if (programs && programs.length > 0) {
        setError(
          `Cannot delete format clock: used by ${programs.length} program(s)`
        );
        setLoading(false);
        return;
      }

      // Delete slots (cascade should handle this, but explicit is better)
      const { error: slotsError } = await supabase
        .from('format_slots')
        .delete()
        .eq('format_clock_id', formatClock.id);

      if (slotsError) throw slotsError;

      // Delete clock
      const { error: deleteError } = await supabase
        .from('format_clocks')
        .delete()
        .eq('id', formatClock.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/format-clocks');
    } catch (err: any) {
      console.error('Format clock delete error:', err);
      setError(err.message || 'Failed to delete format clock');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Clock Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Clock Name *
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., Morning Drive Clock"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          rows={2}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Brief description of this clock structure..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Slots */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Clock Slots</h2>
          <div className="flex items-center gap-4">
            <div
              className={`font-semibold ${
                isValidDuration ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Total: {Math.floor(totalDuration / 60)}:
              {(totalDuration % 60).toString().padStart(2, '0')}
              {isValidDuration ? ' ✓' : ' (must be 60:00)'}
            </div>
            <button
              type="button"
              onClick={addSlot}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Add Slot
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={slots.map((_, i) => `slot-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            {slots.map((slot, index) => (
              <SortableSlot
                key={index}
                slot={slot}
                index={index}
                onUpdate={updateSlot}
                onDelete={deleteSlot}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Visual Preview */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-bold mb-4">Hour Preview</h3>
        <div className="relative h-16 bg-gray-100 rounded overflow-hidden border border-gray-300">
          {slots.reduce(
            (acc, slot) => {
              const percentage = ((slot.duration_sec || 0) / 3600) * 100;
              const slotTypeInfo = SLOT_TYPES.find(
                (t) => t.value === slot.slot_type
              );
              const left = acc.offset;

              acc.elements.push(
                <div
                  key={acc.index}
                  className={`absolute h-full ${slotTypeInfo?.color || 'bg-gray-200'} border-r border-gray-400`}
                  style={{
                    left: `${left}%`,
                    width: `${percentage}%`,
                  }}
                  title={`${slot.slot_type} - ${slot.duration_sec}s`}
                >
                  <div className="text-xs p-1 truncate font-medium">
                    {slot.slot_type}
                  </div>
                </div>
              );

              return {
                offset: left + percentage,
                elements: acc.elements,
                index: acc.index + 1,
              };
            },
            { offset: 0, elements: [] as JSX.Element[], index: 0 }
          ).elements}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0:00</span>
          <span>15:00</span>
          <span>30:00</span>
          <span>45:00</span>
          <span>60:00</span>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-between border-t pt-6">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading || !isValidDuration}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Format Clock'
                : 'Update Format Clock'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Format Clock
          </button>
        )}
      </div>
    </form>
  );
}
