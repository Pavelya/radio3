'use client';

import { useState, useEffect } from 'react';
import { format, formatDistanceToNow, isFuture, isPast } from 'date-fns';

interface Segment {
  id: string;
  scheduled_start_ts: string;
  slot_type: string;
  duration_sec: number;
  programs: { name: string };
  djs: { name: string };
}

export default function Schedule() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [yearOffset, setYearOffset] = useState<number>(500);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const response = await fetch('/api/schedule');
        const data = await response.json();
        setSegments(Array.isArray(data.segments) ? data.segments : []);
        if (data.yearOffset) {
          setYearOffset(data.yearOffset);
        }
      } catch (error) {
        // Silently handle error
        setSegments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();

    // Refresh every minute
    const interval = setInterval(() => {
      fetchSchedule();
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-700 rounded-lg p-4 h-20" />
        ))}
      </div>
    );
  }

  // Get upcoming segments (next 5)
  const upcomingSegments = segments
    .filter((s) => {
      const segmentTime = new Date(s.scheduled_start_ts);
      // Convert from future year to current year
      segmentTime.setFullYear(segmentTime.getFullYear() - yearOffset);
      return isFuture(segmentTime);
    })
    .slice(0, 5);

  if (upcomingSegments.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No upcoming segments scheduled
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcomingSegments.map((segment, index) => {
        const segmentTime = new Date(segment.scheduled_start_ts);
        // Convert from future year to current year
        segmentTime.setFullYear(segmentTime.getFullYear() - yearOffset);

        const isNext = index === 0;
        const timeUntil = formatDistanceToNow(segmentTime, { addSuffix: true });

        return (
          <div
            key={segment.id}
            className={`rounded-lg p-4 transition-all ${
              isNext
                ? 'bg-blue-600 bg-opacity-20 border-2 border-blue-400'
                : 'bg-white bg-opacity-5 border border-white border-opacity-10'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  {isNext && (
                    <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded font-semibold">
                      UP NEXT
                    </span>
                  )}
                  <span className="text-gray-400 text-sm">
                    {format(segmentTime, 'h:mm a')}
                  </span>
                </div>

                <h3 className="text-white font-medium mb-1">
                  {segment.programs.name}
                </h3>

                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <span className="capitalize">{segment.slot_type}</span>
                  <span>•</span>
                  <span>{Math.round(segment.duration_sec / 60)} min</span>
                  <span>•</span>
                  <span>with {segment.djs.name}</span>
                </div>
              </div>

              <div className="text-right ml-4">
                <div className={`text-sm font-medium ${isNext ? 'text-blue-300' : 'text-gray-400'}`}>
                  {timeUntil}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
