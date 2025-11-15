# Audio Processing Functions for AI Radio 2525
# Professional broadcast quality audio

# ============================================
# COMPRESSION & LIMITING
# ============================================

# Multiband compressor for talk
def compress_talk(s) =
  # Light compression for natural speech
  compress(
    attack=5.0,
    release=200.0,
    threshold=-20.0,
    ratio=3.0,
    gain=0.0,
    s
  )
end

# Compressor for music
def compress_music(s) =
  # Moderate compression for consistent level
  compress(
    attack=10.0,
    release=300.0,
    threshold=-18.0,
    ratio=4.0,
    gain=0.0,
    s
  )
end

# Brick wall limiter (prevents clipping)
def limit_output(s) =
  compress(
    attack=1.0,
    release=50.0,
    threshold=-1.0,
    ratio=20.0,
    gain=0.0,
    s
  )
end

# ============================================
# EQUALIZATION
# ============================================

# EQ for speech clarity
def eq_talk(s) =
  # High-pass filter (remove rumble)
  s = filter.iir.eq.high(frequency=80.0, s)

  # Boost presence (2-4 kHz)
  s = filter.iir.eq.peak(frequency=3000.0, q=1.0, gain=3.0, s)

  # Reduce harshness
  s = filter.iir.eq.peak(frequency=6000.0, q=1.5, gain=-2.0, s)

  s
end

# EQ for music
def eq_music(s) =
  # High-pass filter
  s = filter.iir.eq.high(frequency=30.0, s)

  # Slight bass boost
  s = filter.iir.eq.peak(frequency=80.0, q=0.7, gain=2.0, s)

  # Slight treble lift
  s = filter.iir.eq.high_shelf(frequency=10000.0, gain=1.5, s)

  s
end

# ============================================
# DE-ESSER
# ============================================

# Reduce sibilance (harsh 's' sounds)
def deess(s) =
  compress.multiband(
    bands=[
      (0.0, 5000.0, 1.0),           # Low/mid: no compression
      (5000.0, 8000.0, 4.0),        # Sibilance range: compress 4:1
      (8000.0, 22000.0, 1.0)        # High: no compression
    ],
    attack=1.0,
    release=50.0,
    threshold=-25.0,
    s
  )
end

# ============================================
# DUCKING (lower music when talk plays)
# ============================================

# Smart ducking - automatically lower music level when speech is present
def duck(music_source, talk_source) =
  # Detect when talk is active
  talk_active = amplify(0.0, talk_source)

  # Create ducked music source
  music_ducked = amplify(
    override="liq_amplify",
    fun (_, _) -> begin
      # Check if talk source has audio
      if source.is_ready(talk_source) then
        -12.0  # Reduce music by 12dB when talk is active
      else
        0.0    # Normal level when no talk
      end
    end,
    music_source
  )

  music_ducked
end

# ============================================
# BACKGROUND MUSIC BED
# ============================================

# Create background music bed for talk segments
def music_bed(talk_source, music_source) =
  # Use instrumentals only for beds
  bed_music = amplify(-18.0, music_source)  # Very low level

  # Apply slow fade in/out
  bed_music = fade.in(duration=5.0, bed_music)
  bed_music = fade.out(duration=5.0, bed_music)

  # Mix talk over music bed
  add(
    normalize=false,
    [
      amplify(0.0, talk_source),    # Talk at normal level
      bed_music                      # Music at low level
    ]
  )
end

# ============================================
# MASTER CHAIN
# ============================================

def master_chain(s) =
  # 1. EQ
  s = eq_talk(s)

  # 2. De-esser
  s = deess(s)

  # 3. Compression
  s = compress_talk(s)

  # 4. Normalization to broadcast standard
  s = normalize(
    target=-16.0,    # LUFS target
    threshold=-40.0,
    gain_min=-10.0,
    gain_max=10.0,
    s
  )

  # 5. Final limiter
  s = limit_output(s)

  s
end
