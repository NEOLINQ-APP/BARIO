'use client'

import { useRef, useState } from 'react'

const DEFAULT_AVATAR_URL = 'https://storage.bario.ca/bario-storage/victoria-family-generated/avatar-1787158083661-1dsvjsn2.png'
const DEFAULT_AUDIO_URL = 'https://storage.bario.ca/bario-storage/victoria-family-generated/victoria-intro-q270e776.mp3'

export default function VictoriaIntroPlayer({
  avatarUrl = DEFAULT_AVATAR_URL,
  audioUrl = DEFAULT_AUDIO_URL,
  name = 'Victoria',
}: {
  avatarUrl?: string
  audioUrl?: string
  name?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={toggle}
        className="relative group"
        aria-label={playing ? `Pause ${name}'s introduction` : `Play ${name}'s introduction`}
      >
        <div
          className={`absolute inset-0 rounded-full bg-amber-500/30 blur-2xl transition-opacity ${
            playing ? 'opacity-100 animate-pulse' : 'opacity-0 group-hover:opacity-60'
          }`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={`${name} — AI assistant`}
          className={`relative h-56 w-56 sm:h-72 sm:w-72 rounded-full object-cover border-4 transition-all ${
            playing ? 'border-amber-400 scale-105' : 'border-slate-800 group-hover:border-amber-500/60'
          }`}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`h-16 w-16 rounded-full bg-slate-950/60 backdrop-blur flex items-center justify-center transition-opacity ${playing ? 'opacity-0' : 'opacity-90 group-hover:opacity-100'}`}>
            {playing ? (
              <div className="flex gap-1">
                <span className="w-1.5 h-6 bg-white rounded-full" />
                <span className="w-1.5 h-6 bg-white rounded-full" />
              </div>
            ) : (
              <div className="w-0 h-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-white ml-1" />
            )}
          </div>
        </div>
      </button>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        {playing ? 'Playing — tap to pause' : `Tap to hear ${name} introduce herself`}
      </p>
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}
