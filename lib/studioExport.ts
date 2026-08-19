import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import type { ExportRequest, ExportTextOverlay } from '@/lib/studioTypes'
import { RESOLUTIONS } from '@/lib/studioTypes'

const execFileAsync = promisify(execFile)

// Bundled explicitly via next.config.js's outputFileTracingIncludes (public/
// assets aren't guaranteed present on a serverless function's own
// filesystem at runtime, only served via Vercel's separate static layer —
// same reasoning as the ffmpeg binary itself).
// ffmpeg's filter syntax uses ':' as the key=value separator within a
// filter's own option list — an unescaped colon anywhere in a value (a
// Windows drive letter locally, though never on Vercel's Linux paths in
// production) silently breaks the whole -vf chain's parse. Escaping it
// here once covers both environments instead of only working by accident
// on Linux.
const FONT_PATH = path
  .join(process.cwd(), 'assets/fonts/Roboto-Variable.ttf')
  .replace(/\\/g, '/') // path.join uses '\' on Windows; ffmpeg's own escape char is also '\', so an
  // un-normalized Windows path corrupts the filter string in a second, independent way from the
  // colon issue below — normalize to '/' (which ffmpeg accepts on Windows too) before escaping.
  .replace(/:/g, '\\:')

function getFfmpegPath(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path for this platform')
  return ffmpegPath
}

async function runFfmpeg(args: string[]): Promise<string> {
  try {
    const { stderr } = await execFileAsync(getFfmpegPath(), args, { maxBuffer: 1024 * 1024 * 64 })
    return stderr
  } catch (err: any) {
    // ffmpeg writes its real error (bad filter, missing codec, unreadable
    // input) to stderr and exits non-zero — execFile's own error.message is
    // just "Command failed", so surface the actual ffmpeg output instead.
    const detail = err?.stderr ? String(err.stderr).slice(-2000) : err?.message
    throw new Error(`ffmpeg failed: ${detail}`)
  }
}

function parseDurationSeconds(ffmpegStderr: string): number {
  const match = ffmpegStderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
  if (!match) return 0
  const [, h, m, s] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

// ffmpeg's drawtext filter uses ':' as a key=value separator and single
// quotes to wrap string values — any of those characters (plus backslash)
// appearing in real user-typed overlay text has to be escaped or it breaks
// (or silently truncates) the filter graph.
function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function buildDrawtextFilters(overlays: ExportTextOverlay[], clipStart: number, clipDuration: number, width: number, height: number): string[] {
  const filters: string[] = []
  for (const overlay of overlays) {
    const localFrom = Math.max(0, overlay.visibleFromSeconds - clipStart)
    const localTo = Math.min(clipDuration, overlay.visibleToSeconds - clipStart)
    if (localTo <= localFrom) continue // this overlay doesn't actually overlap this clip's span
    const x = Math.round(overlay.xFraction * width)
    const y = Math.round(overlay.yFraction * height)
    const escaped = escapeDrawtext(overlay.text)
    // x/y from the editor's transform already represent the overlay's
    // top-left in canvas space (matching @openvideo/core's transform.x/y),
    // so no extra text_w/text_h centering offset — align:'center' etc. is a
    // styling choice on top, not a positioning one, so it's not applied
    // here in Phase 1 (single-line, left-anchored at the stored position).
    // The enable expression's commas are protected from the outer
    // filtergraph's comma-splitting by the surrounding single quotes
    // already — backslash-escaping them ON TOP of that (an earlier version
    // of this did both) breaks between()'s own argument parser, which
    // fails silently (ffmpeg exits 0, the filter just never enables) rather
    // than erroring, so it's easy to miss without an actual visual check.
    // expansion=none turns off drawtext's own '%{...}' token syntax
    // entirely, so a literal '%' in real user-typed text (a price, a
    // percentage callout) renders as-is instead of needing its own
    // escaping — confirmed necessary: '%%' still hit a real "Stray %"
    // parse failure without this, contrary to what drawtext's docs
    // reference elsewhere for printf-style formatting contexts.
    filters.push(
      `drawtext=fontfile='${FONT_PATH}':text='${escaped}':fontsize=${overlay.fontSize}:fontcolor=${overlay.color.replace('#', '0x')}:x=${x}:y=${y}:expansion=none:enable='between(t,${localFrom.toFixed(3)},${localTo.toFixed(3)})'`
    )
  }
  return filters
}

export async function renderExport(req: ExportRequest, opts: { workDir: string }): Promise<{ outputPath: string; durationSeconds: number }> {
  const { workDir } = opts
  await fs.mkdir(workDir, { recursive: true })
  const { width, height } = RESOLUTIONS[req.aspectRatio]

  const orderedClips = [...req.clips].sort((a, b) => a.startSeconds - b.startSeconds)
  if (orderedClips.length === 0) throw new Error('Export needs at least one video or image clip')

  // Normalize pass: one intermediate segment per source clip, uniform
  // resolution/fps/codec (concat demuxer requires this — mixed-resolution
  // sources can't go straight into a raw concat), trimmed to the clip's own
  // span, with any text overlay active during that span burned in.
  const segmentPaths: string[] = []
  for (let i = 0; i < orderedClips.length; i++) {
    const clip = orderedClips[i]
    const drawtextFilters = buildDrawtextFilters(req.textOverlays, clip.startSeconds, clip.durationSeconds, width, height)
    const vf = [`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`, 'fps=30', 'format=yuv420p', ...drawtextFilters].join(',')
    const segmentPath = path.join(workDir, `seg_${i}.mp4`)
    const args =
      clip.type === 'Image'
        ? ['-y', '-loop', '1', '-i', clip.src, '-t', String(clip.durationSeconds), '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', segmentPath]
        : [
            '-y',
            '-ss', String(clip.trimStartSeconds),
            '-i', clip.src,
            '-t', String(clip.durationSeconds),
            '-vf', vf,
            '-an',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            segmentPath,
          ]
    await runFfmpeg(args)
    segmentPaths.push(segmentPath)
  }

  // Concat pass: all segments are now uniform, so this is a fast stream
  // copy, no re-encode.
  const concatListPath = path.join(workDir, 'concat_list.txt')
  const concatList = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  await fs.writeFile(concatListPath, concatList, 'utf8')
  const concatenatedPath = path.join(workDir, 'concatenated.mp4')
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', concatenatedPath])

  const outputPath = path.join(workDir, 'export.mp4')

  if (req.audioTracks.length === 0) {
    // No audio requested — the concatenated video is already the final
    // output, just under its final name.
    await fs.copyFile(concatenatedPath, outputPath)
  } else {
    // Audio mux pass: each track gets its own input, delayed to its
    // timeline offset and volume-adjusted, then mixed together against the
    // video's own duration (not the longest audio track, so a long music
    // bed gets cut to the video's length rather than extending it).
    const audioInputArgs: string[] = []
    const audioFilterParts: string[] = []
    req.audioTracks.forEach((track, i) => {
      audioInputArgs.push('-i', track.src)
      const delayMs = Math.max(0, Math.round(track.offsetSeconds * 1000))
      audioFilterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${track.volume}[a${i}]`)
    })
    const mixInputs = req.audioTracks.map((_, i) => `[a${i}]`).join('')
    const filterComplex = `${audioFilterParts.join(';')};${mixInputs}amix=inputs=${req.audioTracks.length}:duration=first:dropout_transition=0[aout]`
    await runFfmpeg([
      '-y',
      '-i', concatenatedPath,
      ...audioInputArgs,
      '-filter_complex', filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      outputPath,
    ])
  }

  const probeStderr = await runFfmpeg(['-i', outputPath]).catch((err) => {
    // ffmpeg with no output file exits non-zero even on success (it's just
    // printing input info) — the error path still carries the stderr text
    // we actually want, so pull it back out rather than treating this as
    // a real failure.
    const match = /ffmpeg failed: ([\s\S]*)/.exec(err.message)
    return match ? match[1] : ''
  })
  const durationSeconds = parseDurationSeconds(probeStderr)

  // Clean up intermediates, keep only the final output the caller will
  // upload — workDir itself is Vercel's ephemeral /tmp, cleaned up by the
  // platform between invocations regardless, but this keeps memory/disk
  // pressure down within a single long-running request too.
  await Promise.all(segmentPaths.map((p) => fs.unlink(p).catch(() => {})))
  await fs.unlink(concatListPath).catch(() => {})
  await fs.unlink(concatenatedPath).catch(() => {})

  return { outputPath, durationSeconds }
}
