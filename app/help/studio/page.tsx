export const metadata = {
  title: 'Bario Studio — How to use it & FAQ',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      {children}
    </section>
  )
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-slate-900 dark:text-white">{q}</p>
      <p className="mt-1">{children}</p>
    </div>
  )
}

export default function StudioHelpPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-10">
        <div>
          <a href="/dashboard/studio" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">← Back to Studio</a>
          <h1 className="text-2xl font-bold mt-4">Bario Studio — How to use it</h1>
          <p className="text-sm text-slate-500 mt-2">Video, social posts, and print materials, with an AI assistant to help build them.</p>
        </div>

        <Section title="Video Editor">
          <p>
            Open <strong>Studio → Video Editor</strong>. The <strong>Assistant</strong> tab is the easiest way in — just describe
            what you want ("make me a 5 second video of a sunset over the ocean") and it generates it and drops it onto your
            canvas for you. You can also switch to the <strong>Video</strong>, <strong>Voiceover</strong>, <strong>Text</strong>, or{' '}
            <strong>Music</strong> tabs to add each of those manually with full control (prompt, duration, voice, your own
            uploaded audio).
          </p>
          <p>
            Everything you've added shows up in the <strong>Clips</strong> list below the canvas — remove anything you don't
            want with one click. When you're happy with it, hit <strong>Export MP4</strong> to render a real video file you can
            download.
          </p>
        </Section>

        <Section title="Design (Posts)">
          <p>
            Switch to <strong>Studio → Design (Posts)</strong> for static images — Instagram/TikTok posts and stories, Facebook
            posts, X posts. Pick a template size at the top, then use the Assistant to add text or search for a matching stock
            photo, or switch to <strong>Manual</strong> to upload your own image and type your own headline. Hit{' '}
            <strong>Export PNG</strong> when it's ready.
          </p>
        </Section>

        <Section title="Print (business cards, flyers, signs)">
          <p>
            Print templates live in the same Design mode, under the <strong>Print</strong> section of the template picker.
            These are sized to real physical dimensions (e.g. a business card is genuinely 3.5×2 inches) with a small bleed
            margin already built in, so you don't need to think about print setup yourself. Build your design the same way as
            a social post, then use <strong>Export PDF (print-ready)</strong> — that's the file to send to a print shop or
            upload to an online printing service.
          </p>
        </Section>

        <Section title="Frequently asked questions">
          <div className="space-y-4">
            <FaqItem q="Does generating a video or voiceover cost me anything?">
              Yes — each AI generation uses credits from your plan, based on video length or voiceover text length. Adding
              text, uploading your own music/images, and exporting are all free.
            </FaqItem>
            <FaqItem q="I added text but it's missing from my exported video — why?">
              This is a known limitation right now: text overlays show correctly while you're editing, but the video export
              step doesn't include them yet. Everything else (your AI-generated clips, voiceover, and your own uploaded
              music) exports correctly. Text export is something we're working on.
            </FaqItem>
            <FaqItem q="What voices can I use for voiceover?">
              Six real voices today — a warm or elegant female voice and two male voices in American English, plus a female
              and male voice in British English. Pick whichever fits your video's tone.
            </FaqItem>
            <FaqItem q="Can I use my own music?">
              Yes — upload any audio file on the Music tab and it's added as its own track alongside your video/voiceover.
            </FaqItem>
            <FaqItem q="What if a generation fails?">
              You're automatically refunded the credits for that attempt — you're never charged for a failed generation.
            </FaqItem>
            <FaqItem q="Is my exported video/design private?">
              Yes, exports happen in your own browser — nothing is rendered or stored on a shared server as part of the
              export step itself.
            </FaqItem>
            <FaqItem q="Which print template should I pick?">
              Business Card for a standard 3.5×2in card, Flyer/Brochure for a full Letter-size sheet, or Yard Sign for
              large-format signage. Each already includes the right bleed margin for its format.
            </FaqItem>
            <FaqItem q="Is the print PDF ready to send straight to any print shop?">
              It's sized correctly (real inches, with bleed) and high-resolution, which is what most online print services
              need. It isn't a full professional color-managed (CMYK) file, so for very color-critical print jobs, check with
              your printer first.
            </FaqItem>
          </div>
        </Section>

        <p className="text-xs text-slate-500 dark:text-slate-600 pt-4 border-t border-slate-200 dark:border-slate-800">
          Still stuck? Contact hello@bario.ca.
        </p>
      </div>
    </main>
  )
}
