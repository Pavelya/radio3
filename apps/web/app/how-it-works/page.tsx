import Link from 'next/link';

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
            ← AI Radio 2525
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 border border-white border-opacity-20 text-white space-y-8">
          <h1 className="text-4xl font-bold mb-8">How It Works</h1>

          <section>
            <h2 className="text-2xl font-bold mb-4">The Pipeline</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              AI Radio 2525 uses a sophisticated content generation pipeline that runs continuously
              to create, synthesize, and broadcast radio content:
            </p>

            <div className="space-y-4">
              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">1️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Knowledge Base</h3>
                    <p className="text-gray-300">
                      A curated knowledge base contains worldbuilding documents and historical events
                      from the year 2525. This creates a consistent universe for all content.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">2️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Schedule Generation</h3>
                    <p className="text-gray-300">
                      A scheduler creates daily programming schedules with different segment types:
                      news, culture, technology, interviews, and music.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">3️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">RAG Retrieval</h3>
                    <p className="text-gray-300">
                      For each segment, relevant information is retrieved from the knowledge base
                      using vector similarity search and lexical matching.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">4️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Script Generation</h3>
                    <p className="text-gray-300">
                      Claude AI generates radio scripts based on the retrieved context, maintaining
                      the DJ's personality and the segment's topic.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">5️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Speech Synthesis</h3>
                    <p className="text-gray-300">
                      Piper TTS converts the script into natural-sounding speech using neural
                      text-to-speech models.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">6️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Audio Mastering</h3>
                    <p className="text-gray-300">
                      Audio is normalized to broadcast standards (-16 LUFS) with peak limiting
                      to ensure consistent volume.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">7️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Broadcasting</h3>
                    <p className="text-gray-300">
                      Liquidsoap playout engine streams the final audio to Icecast, making it
                      available to listeners worldwide.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Technology Stack</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🤖 AI & Generation</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Claude AI (Anthropic)</li>
                  <li>• Piper TTS</li>
                  <li>• bge-m3 embeddings</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">⚙️ Backend</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• FastAPI (Python)</li>
                  <li>• Node.js workers</li>
                  <li>• Supabase (PostgreSQL)</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🎙️ Broadcasting</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Liquidsoap</li>
                  <li>• Icecast</li>
                  <li>• FFmpeg</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🌐 Frontend</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Next.js 14</li>
                  <li>• React</li>
                  <li>• Tailwind CSS</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="text-center pt-8">
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Start Listening →
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
