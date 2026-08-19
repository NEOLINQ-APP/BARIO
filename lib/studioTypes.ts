import type { AnyClip, IProject } from '@openvideo/core'

// @openvideo/core stores all timing (timing.display.from/to, timing.trim.from/to,
// timing.duration) in MICROSECONDS, not seconds — confirmed via its compiled
// source (DEFAULT_DURATION = 5e6 = 5 real seconds). Every value crossing the
// client/server boundary here is in whole seconds instead, converted at the
// mapping boundary below, so lib/studioExport.ts (ffmpeg, which thinks in
// seconds) never has to know about this library's internal unit choice.
const MICROSECONDS_PER_SECOND = 1_000_000

export type AspectRatioPreset = '16:9' | '9:16' | '1:1'

export const RESOLUTIONS: Record<AspectRatioPreset, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
}

// A render longer than this would risk running past the export route's
// maxDuration (280s) — this is a safety cap, not a measured real limit; see
// the plan's "risks" section for what to do if real render times need it
// lower (or prove there's headroom to raise it).
export const MAX_EXPORT_DURATION_SECONDS = 120

export type ExportClip = {
  id: string
  type: 'Video' | 'Image'
  src: string
  // Position within the final exported timeline, in seconds.
  startSeconds: number
  durationSeconds: number
  // Trim into the SOURCE media, in seconds (0/duration for images, which
  // have no native trim range of their own).
  trimStartSeconds: number
  trimEndSeconds: number
}

export type ExportTextOverlay = {
  text: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  // Position as a 0-1 fraction of the frame, matching how @openvideo/core
  // stores transform.x/y relative to its own canvas — translated to actual
  // pixel coordinates against the chosen aspect ratio's resolution at
  // render time (see lib/studioExport.ts).
  xFraction: number
  yFraction: number
  visibleFromSeconds: number
  visibleToSeconds: number
}

export type ExportAudioTrack = {
  src: string
  volume: number // 0-1
  offsetSeconds: number
}

export type ExportRequest = {
  aspectRatio: AspectRatioPreset
  clips: ExportClip[]
  textOverlays: ExportTextOverlay[]
  audioTracks: ExportAudioTrack[]
}

function usToSeconds(us: number): number {
  return us / MICROSECONDS_PER_SECOND
}

// Flattens a live @openvideo/core project (tracks + clips, all in its own
// microsecond/pixel-space units) into the flatter, seconds-based wire
// contract the export API and ffmpeg pipeline actually consume. Deliberately
// NOT a 1:1 mirror of IProject — decouples the server render pipeline from
// this library's internal shape so a future @openvideo/core upgrade can't
// silently break rendering.
export function mapProjectToExportRequest(project: IProject, aspectRatio: AspectRatioPreset): ExportRequest {
  const { width: canvasWidth, height: canvasHeight } = project.settings
  const clips: ExportClip[] = []
  const textOverlays: ExportTextOverlay[] = []
  const audioTracks: ExportAudioTrack[] = []

  const orderedClips = Object.values(project.clips).sort(
    (a, b) => a.timing.display.from - b.timing.display.from
  )

  for (const clip of orderedClips) {
    if (clip.type === 'Video' || clip.type === 'Image') {
      const c = clip as AnyClip & { type: 'Video' | 'Image'; src: string }
      clips.push({
        id: c.id,
        type: c.type,
        src: c.src,
        startSeconds: usToSeconds(c.timing.display.from),
        durationSeconds: usToSeconds(c.timing.display.to - c.timing.display.from),
        trimStartSeconds: usToSeconds(c.timing.trim.from),
        trimEndSeconds: usToSeconds(c.timing.trim.to),
      })
    } else if (clip.type === 'Text') {
      const c = clip as AnyClip & { type: 'Text'; text: string; style?: { fontSize?: number; color?: string; align?: 'left' | 'center' | 'right' } }
      textOverlays.push({
        text: c.text,
        fontSize: c.style?.fontSize ?? 48,
        color: c.style?.color ?? '#ffffff',
        align: c.style?.align ?? 'center',
        xFraction: canvasWidth > 0 ? c.transform.x / canvasWidth : 0.5,
        yFraction: canvasHeight > 0 ? c.transform.y / canvasHeight : 0.5,
        visibleFromSeconds: usToSeconds(c.timing.display.from),
        visibleToSeconds: usToSeconds(c.timing.display.to),
      })
    } else if (clip.type === 'Audio') {
      const c = clip as AnyClip & { type: 'Audio'; src: string }
      audioTracks.push({
        src: c.src,
        volume: 1,
        offsetSeconds: usToSeconds(c.timing.display.from),
      })
    }
  }

  return { aspectRatio, clips, textOverlays, audioTracks }
}

export function totalExportDurationSeconds(req: ExportRequest): number {
  let end = 0
  for (const c of req.clips) end = Math.max(end, c.startSeconds + c.durationSeconds)
  for (const a of req.audioTracks) end = Math.max(end, a.offsetSeconds)
  return end
}
