import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Fetch from backend API
    // For now, we'll proxy to Supabase directly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const yearOffset = parseInt(process.env.NEXT_PUBLIC_FUTURE_YEAR_OFFSET || '500', 10);

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    // Calculate future year date using FUTURE_YEAR_OFFSET
    const currentDate = new Date(date);
    const futureDate = new Date(currentDate);
    futureDate.setFullYear(futureDate.getFullYear() + yearOffset);

    const dayStart = new Date(futureDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(futureDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Fetch segments
    const response = await fetch(
      `${supabaseUrl}/rest/v1/segments?select=*,programs(name),djs(name)&scheduled_start_ts=gte.${dayStart.toISOString()}&scheduled_start_ts=lte.${dayEnd.toISOString()}&state=eq.ready&order=scheduled_start_ts.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const data = await response.json();

    // Ensure we return an array, even if Supabase returns an error
    const segments = Array.isArray(data) ? data : [];

    return NextResponse.json({ segments, yearOffset });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
