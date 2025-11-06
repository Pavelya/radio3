'use client';

import { useState } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface ScheduleSlot {
  id: string;
  program: {
    id: string;
    name: string;
    dj: { name: string };
  };
  start_time: string;
  end_time: string;
  day_of_week: number | null;
  priority: number;
}

interface BroadcastScheduleGridProps {
  initialGrid: Record<string, ScheduleSlot[]>;
  programs: Array<{
    id: string;
    name: string;
    dj: { name: string };
  }>;
}

export default function BroadcastScheduleGrid({ initialGrid, programs }: BroadcastScheduleGridProps) {
  const [grid, setGrid] = useState<Record<string, ScheduleSlot[]>>(initialGrid);
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const API_URL = 'http://localhost:8000';

  async function loadData() {
    const res = await fetch(`${API_URL}/admin/broadcast-schedule/grid`);
    const data = await res.json();
    setGrid(data.grid);
  }

  async function addScheduleSlot(day: number, hour: number) {
    if (!selectedProgram) {
      alert('Please select a program first');
      return;
    }

    setLoading(true);

    const slot = {
      program_id: selectedProgram,
      day_of_week: day,
      start_time: `${hour.toString().padStart(2, '0')}:00:00`,
      end_time: `${((hour + 1) % 24).toString().padStart(2, '0')}:00:00`,
      priority: 0,
    };

    try {
      const res = await fetch(`${API_URL}/admin/broadcast-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot),
      });

      const data = await res.json();

      if (data.conflicts && data.conflicts.length > 0) {
        const override = confirm(
          `Conflicts detected with:\n${data.conflicts.map((c: any) => c.program_name).join('\n')}\n\nAdd anyway?`
        );
        if (!override) {
          setLoading(false);
          return;
        }

        // Add with higher priority
        slot.priority = 10;
        await fetch(`${API_URL}/admin/broadcast-schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slot),
        });
      }

      await loadData();
    } catch (error) {
      console.error('Error adding schedule slot:', error);
      alert('Failed to add schedule slot');
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(slotId: string) {
    if (!confirm('Remove this schedule slot?')) return;

    setLoading(true);

    try {
      await fetch(`${API_URL}/admin/broadcast-schedule/${slotId}`, {
        method: 'DELETE',
      });

      await loadData();
    } catch (error) {
      console.error('Error deleting schedule slot:', error);
      alert('Failed to delete schedule slot');
    } finally {
      setLoading(false);
    }
  }

  function getSlotForCell(day: number, hour: number): ScheduleSlot | null {
    const daySlots = grid[day.toString()] || [];
    const allDaySlots = grid['all_days'] || [];

    const allSlots = [...daySlots, ...allDaySlots];

    for (const slot of allSlots) {
      const startHour = parseInt(slot.start_time.split(':')[0]);
      const endHour = parseInt(slot.end_time.split(':')[0]);

      if (hour >= startHour && hour < endHour) {
        return slot;
      }
    }

    return null;
  }

  function getCellColor(slot: ScheduleSlot | null): string {
    if (!slot) return 'bg-gray-50 hover:bg-gray-100';

    const colors = [
      'bg-blue-100', 'bg-green-100', 'bg-yellow-100',
      'bg-purple-100', 'bg-pink-100', 'bg-indigo-100',
    ];

    const index = programs.findIndex(p => p.id === slot.program.id);
    return colors[index % colors.length];
  }

  return (
    <div>
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <div className="flex gap-4 items-center">
          <label className="font-semibold">Select Program:</label>
          <select
            className="border px-3 py-2 rounded flex-1 max-w-md"
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Choose Program --</option>
            {programs.map(program => (
              <option key={program.id} value={program.id}>
                {program.name} ({program.dj.name})
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-600">
            Click on a time slot to assign the selected program
          </span>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="border-collapse border w-full text-sm">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-200 sticky left-0 z-10">Hour</th>
              {DAYS.map((day, idx) => (
                <th key={idx} className="border p-2 bg-gray-200">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td className="border p-2 font-semibold bg-gray-100 sticky left-0 z-10">
                  {hour.toString().padStart(2, '0')}:00
                </td>
                {DAYS.map((_, day) => {
                  const slot = getSlotForCell(day, hour);
                  return (
                    <td
                      key={day}
                      className={`border p-1 cursor-pointer transition-colors ${getCellColor(slot)} ${loading ? 'opacity-50' : ''}`}
                      onClick={() => !slot && !loading && addScheduleSlot(day, hour)}
                    >
                      {slot ? (
                        <div className="relative group min-h-[40px]">
                          <div className="text-xs font-semibold truncate">
                            {slot.program.name}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {slot.program.dj.name}
                          </div>
                          <button
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-red-600 font-bold px-1 bg-white rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSlot(slot.id);
                            }}
                            disabled={loading}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-xs min-h-[40px] flex items-center justify-center">
                          +
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-white rounded-lg shadow">
        <h3 className="font-bold mb-2">Programs:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {programs.map((program, idx) => {
            const colors = [
              'bg-blue-100', 'bg-green-100', 'bg-yellow-100',
              'bg-purple-100', 'bg-pink-100', 'bg-indigo-100',
            ];
            return (
              <div key={program.id} className={`p-2 rounded ${colors[idx % colors.length]}`}>
                <div className="font-semibold text-sm">{program.name}</div>
                <div className="text-xs text-gray-600">{program.dj.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
