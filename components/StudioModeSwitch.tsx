'use client'

// Studio landing shell — organizes the real, already-working Studio features
// (video/image-to-video generation, voiceover, AI copilot, social + print
// design templates) behind a category sidebar + tool-card grid, the layout
// the user asked for after seeing a static Canva-style mockup. Every card
// here either deep-links into an existing, working StudioEditor/
// StudioDesignEditor tab, or is honestly marked "Coming soon" — no card
// wired to do nothing silently.

import { useState } from 'react'
import StudioEditor, { type StudioEditorTab } from '@/components/StudioEditor'
import StudioDesignEditor from '@/components/StudioDesignEditor'

type Target =
  | { kind: 'video'; tab: StudioEditorTab }
  | { kind: 'design'; templateId: string }

type Tool = {
  id: string
  icon: string
  title: string
  desc: string
  target?: Target // absent => not built yet
}

type Category = {
  id: string
  title: string
  tools: Tool[]
}

const CATEGORIES: Category[] = [
  {
    id: 'print',
    title: 'Print & Graphics',
    tools: [
      { id: 'business-card', icon: '💳', title: 'Business Cards', desc: 'Print-ready 3.5×2in card with bleed, exports as a real PDF.', target: { kind: 'design', templateId: 'business-card' } },
      { id: 'flyer', icon: '📄', title: 'Flyers & Brochures', desc: 'Letter-size print flyer with bleed, PDF export.', target: { kind: 'design', templateId: 'flyer' } },
      { id: 'sign', icon: '🪧', title: 'Yard Signs', desc: '18×24in large-format sign, print-ready PDF export.', target: { kind: 'design', templateId: 'sign' } },
      { id: 'social', icon: '📱', title: 'Social Graphics', desc: 'Instagram, Facebook, X, and Story-sized posts.', target: { kind: 'design', templateId: 'ig-post' } },
      { id: 'logo', icon: '🔷', title: 'Logo Creator', desc: 'Generate a brand logo and color palette from a prompt.' },
      { id: 'brand-kit', icon: '🎨', title: 'Brand Kits & Style', desc: 'Save a palette, fonts, and logo as a reusable brand kit.' },
    ],
  },
  {
    id: 'video',
    title: 'Video & Ads Studio',
    tools: [
      { id: 'video-gen', icon: '🎬', title: 'Commercials & Video Ads', desc: 'Generate a short AI video from a text prompt.', target: { kind: 'video', tab: 'video' } },
      { id: 'image-to-video', icon: '🖼️', title: 'Image to Video', desc: 'Animate a source photo into motion — same generator, with an image attached.', target: { kind: 'video', tab: 'video' } },
      { id: 'video-editor', icon: '🎞️', title: 'Video Editor & Canvas', desc: 'Combine generated clips, voiceover, text, and music on one timeline.', target: { kind: 'video', tab: 'text' } },
    ],
  },
  {
    id: 'voice',
    title: 'AI & Voice Suite',
    tools: [
      { id: 'assistant', icon: '🤖', title: 'AI Editing Assistant', desc: 'Tell the copilot what to create — it generates and adds it for you.', target: { kind: 'video', tab: 'assistant' } },
      { id: 'voiceover', icon: '🎙️', title: 'Voiceover', desc: 'Text-to-speech narration in several real voices.', target: { kind: 'video', tab: 'voiceover' } },
      { id: 'avatars', icon: '🧑‍🚀', title: 'AI Avatars', desc: 'Lip-synced talking avatar videos.' },
      { id: 'voice-cloning', icon: '🗣️', title: 'Voice Cloning', desc: 'Clone a specific voice from a sample recording.' },
    ],
  },
  {
    id: 'photo',
    title: 'Photo Studio',
    tools: [
      { id: 'bg-remove', icon: '✂️', title: 'Background Remover', desc: 'Isolate a subject from a photo in one click.' },
      { id: 'object-erase', icon: '🪄', title: 'Object Eraser', desc: 'Remove unwanted objects from a photo.' },
      { id: 'upscale', icon: '🔍', title: 'Upscaler & Vectorizer', desc: 'Increase image resolution or convert to a scalable vector.' },
    ],
  },
]

export default function StudioModeSwitch() {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id)
  const [active, setActive] = useState<Target | null>(null)

  if (active) {
    return (
      <div>
        <button
          onClick={() => setActive(null)}
          className="mb-4 text-sm font-medium text-amber-600 dark:text-[#f59e0b] hover:underline"
        >
          ← All Studio tools
        </button>
        {active.kind === 'video' ? (
          <StudioEditor initialTab={active.tab} />
        ) : (
          <StudioDesignEditor initialTemplateId={active.templateId} />
        )}
      </div>
    )
  }

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0]

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`text-left whitespace-nowrap text-sm font-medium px-3 py-2 rounded-lg ${
              c.id === categoryId
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
          >
            {c.title}
          </button>
        ))}
      </nav>

      <div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {category.tools.map((tool) => {
            const soon = !tool.target
            return (
              <button
                key={tool.id}
                disabled={soon}
                onClick={() => tool.target && setActive(tool.target)}
                className={`text-left rounded-2xl border p-4 flex flex-col gap-2 ${
                  soon
                    ? 'border-slate-200 dark:border-zinc-800 opacity-60 cursor-not-allowed'
                    : 'border-slate-300 dark:border-zinc-700 hover:border-amber-500 dark:hover:border-amber-500 hover:-translate-y-0.5 transition'
                } bg-white dark:bg-[#131b2a]`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{tool.icon}</span>
                  {soon && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm">{tool.title}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{tool.desc}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
