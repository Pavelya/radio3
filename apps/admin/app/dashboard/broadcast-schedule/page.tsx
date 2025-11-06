import { createSupabaseServerClient } from '@/lib/supabase-server';
import BroadcastScheduleGrid from '@/components/broadcast-schedule-grid';

export default async function BroadcastSchedulePage() {
  const supabase = await createSupabaseServerClient();

  // Fetch schedule grid
  const { data: scheduleData, error: scheduleError } = await supabase
    .from('broadcast_schedule')
    .select(`
      *,
      program:programs(
        id,
        name,
        dj:djs!fk_programs_dj(name)
      )
    `)
    .order('start_time');

  // Fetch all active programs
  const { data: programs, error: programsError } = await supabase
    .from('programs')
    .select(`
      id,
      name,
      dj:djs!fk_programs_dj(id, name)
    `)
    .eq('active', true)
    .order('name');

  if (scheduleError || programsError) {
    return (
      <div className="text-red-600">
        Error loading data: {scheduleError?.message || programsError?.message}
      </div>
    );
  }

  // Organize schedule by day
  const grid: Record<string, any[]> = {
    '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
    'all_days': []
  };

  for (const slot of scheduleData || []) {
    const day = slot.day_of_week;
    if (day === null) {
      grid['all_days'].push(slot);
    } else {
      grid[day.toString()].push(slot);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Broadcast Schedule</h1>
        <p className="text-gray-600">
          Manage your weekly broadcast schedule. Assign programs to specific time slots.
        </p>
      </div>

      <BroadcastScheduleGrid initialGrid={grid} programs={programs || []} />
    </div>
  );
}
