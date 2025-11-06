'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 500);
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
    >
      {loading ? 'Refreshing...' : '↻ Refresh'}
    </button>
  );
}
