import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import TrackEditForm from './track-edit-form';

export default async function TrackEditPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Fetch track data
  const { data: track, error } = await supabase
    .from('music_tracks')
    .select('*, genre:music_genres(id, name)')
    .eq('id', params.id)
    .single();

  if (error || !track) {
    notFound();
  }

  // Get signed URL for audio preview
  let audioUrl = null;
  if (track.storage_path) {
    const { data: signedUrl } = await supabase.storage
      .from('audio-assets')
      .createSignedUrl(track.storage_path, 3600);

    audioUrl = signedUrl?.signedUrl || null;
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Track</h1>
      <TrackEditForm track={{ ...track, audioUrl }} />
    </div>
  );
}
