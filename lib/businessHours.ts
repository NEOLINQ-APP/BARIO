// Business-hours math for the Client Requests Portal (AFC Logistics +
// Sunbuilt Group). Work window: Mon-Fri, 9:00am-6:00pm, America/Edmonton
// (handles the real MST/MDT switch, not a fixed UTC offset).

const TIME_ZONE = 'America/Edmonton'
const WORK_START_HOUR = 9
const WORK_END_HOUR = 18
const WORK_MINUTES_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 60

type EdmontonParts = {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: string // 'Mon' | 'Tue' | ...
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
})

function getEdmontonParts(date: Date): EdmontonParts {
  const raw = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour: raw.hour === '24' ? 0 : Number(raw.hour),
    minute: Number(raw.minute),
    weekday: raw.weekday,
  }
}

// Converts a wall-clock time as seen in America/Edmonton back into a real
// UTC Date. Edmonton's offset is always a whole number of hours (-7 or -6),
// so one correction pass always converges exactly.
function edmontonWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute)
  for (let i = 0; i < 2; i++) {
    const seen = getEdmontonParts(new Date(guessMs))
    const seenMs = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    const wantedMs = Date.UTC(year, month - 1, day, hour, minute)
    guessMs -= seenMs - wantedMs
  }
  return new Date(guessMs)
}

const WEEKEND = new Set(['Sat', 'Sun'])

function nextWeekday(year: number, month: number, day: number, weekday: string): { year: number; month: number; day: number } {
  let d = new Date(Date.UTC(year, month - 1, day))
  let w = weekday
  while (WEEKEND.has(w)) {
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    w = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d)
  }
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

// Snaps a moment into the business window: weekends and after-hours roll
// forward to the next business day's 9:00am; before-hours rolls forward to
// 9:00am the same day.
function snapIntoBusinessWindow(date: Date): Date {
  const p = getEdmontonParts(date)
  const minutesNow = p.hour * 60 + p.minute
  const isWeekend = WEEKEND.has(p.weekday)
  const isAfterHours = minutesNow >= WORK_END_HOUR * 60

  if (isWeekend || isAfterHours) {
    const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
    const nextWeekdayLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(nextDay)
    const next = nextWeekday(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), nextWeekdayLabel)
    return edmontonWallTimeToUtc(next.year, next.month, next.day, WORK_START_HOUR, 0)
  }
  if (minutesNow < WORK_START_HOUR * 60) {
    return edmontonWallTimeToUtc(p.year, p.month, p.day, WORK_START_HOUR, 0)
  }
  return date
}

function startOfNextBusinessDay(date: Date): Date {
  const p = getEdmontonParts(date)
  const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
  const nextWeekdayLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(nextDay)
  const next = nextWeekday(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), nextWeekdayLabel)
  return edmontonWallTimeToUtc(next.year, next.month, next.day, WORK_START_HOUR, 0)
}

/**
 * Walks forward `hours` of real working time (Mon-Fri, 9am-6pm America/Edmonton)
 * from `from`, rolling over evenings/weekends as needed.
 */
export function addBusinessHours(from: Date, hours: number): Date {
  let remainingMinutes = Math.round(hours * 60)
  let cursor = snapIntoBusinessWindow(from)

  while (remainingMinutes > 0) {
    const p = getEdmontonParts(cursor)
    const minutesUsedToday = (p.hour - WORK_START_HOUR) * 60 + p.minute
    const minutesLeftToday = WORK_MINUTES_PER_DAY - minutesUsedToday

    if (remainingMinutes <= minutesLeftToday) {
      const totalMinutes = minutesUsedToday + remainingMinutes
      const hour = WORK_START_HOUR + Math.floor(totalMinutes / 60)
      const minute = totalMinutes % 60
      cursor = edmontonWallTimeToUtc(p.year, p.month, p.day, hour, minute)
      remainingMinutes = 0
    } else {
      remainingMinutes -= minutesLeftToday
      cursor = startOfNextBusinessDay(cursor)
    }
  }

  return cursor
}

/**
 * Given the total hours of work already queued ahead of a new task, plus the
 * new task's own estimated hours, returns the business-hours-aware ETA.
 */
export function estimateCompletion(hoursAheadInQueue: number, newTaskHours: number, now: Date = new Date()): Date {
  return addBusinessHours(now, hoursAheadInQueue + newTaskHours)
}
