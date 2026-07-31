'use client'

import { useState } from 'react'
import StudioEditor from '@/components/StudioEditor'
import StudioDesignEditor from '@/components/StudioDesignEditor'

export default function StudioModeSwitch() {
  const [mode, setMode] = useState<'video' | 'design'>('video')

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('video')}
          className={`text-sm font-medium px-4 py-2 rounded-lg ${mode === 'video' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
        >
          🎬 Video Editor
        </button>
        <button
          onClick={() => setMode('design')}
          className={`text-sm font-medium px-4 py-2 rounded-lg ${mode === 'design' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
        >
          🖼️ Design (Posts)
        </button>
      </div>
      {mode === 'video' ? <StudioEditor /> : <StudioDesignEditor />}
    </div>
  )
}
