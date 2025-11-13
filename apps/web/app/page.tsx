import AudioPlayer from '@/components/audio-player';
import NowPlaying from '@/components/now-playing';

export default function HomePage() {
  const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || 'http://localhost:8001/radio.opus';
  const fallbackUrl = process.env.NEXT_PUBLIC_STREAM_URL_FALLBACK || 'http://localhost:8001/radio.mp3';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      {/* Header */}
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">
                AI Radio 2525
              </h1>
              <p className="text-gray-300 mt-1">
                Broadcasting from the future
              </p>
            </div>
            <div className="text-right text-white">
              <div className="text-5xl font-bold">2525</div>
              <div className="text-sm text-gray-400">Year</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Now Playing */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 text-white border border-white border-opacity-20">
            <div className="text-sm uppercase tracking-wide text-gray-300 mb-4">
              Now Playing
            </div>
            <NowPlaying />
          </div>

          {/* Audio Player */}
          <AudioPlayer streamUrl={streamUrl} fallbackUrl={fallbackUrl} />

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">🎙️</div>
              <h3 className="font-semibold mb-1">AI Generated</h3>
              <p className="text-sm text-gray-300">
                All content created by Claude and synthesized in real-time
              </p>
            </div>

            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">🌍</div>
              <h3 className="font-semibold mb-1">Year 2525</h3>
              <p className="text-sm text-gray-300">
                Experience radio from 500 years in the future
              </p>
            </div>

            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">📡</div>
              <h3 className="font-semibold mb-1">24/7 Live</h3>
              <p className="text-sm text-gray-300">
                Continuous broadcast with news, culture, and music
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-12">
        <div className="border-t border-white border-opacity-10 pt-8 text-center text-gray-400 text-sm">
          <p>AI Radio 2525 - An experimental AI radio station</p>
          <p className="mt-2">
            Powered by Claude, Piper TTS, and Liquidsoap
          </p>
        </div>
      </footer>
    </div>
  );
}
