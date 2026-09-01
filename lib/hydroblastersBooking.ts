// HydroBlasters' booking-spacing rule (owner's own words, 2026-09-01):
// "make sure booking are atleast 72hours apart unless the job is 4 hours or
// less to do then we can do 2 jobs a day. Cause we need time to setup since
// we are just starting." Kept as its own small module (not shared Bario One
// platform logic) since this is one client's operational policy, not a
// generic scheduling feature every org would want the same way.

const SHORT_JOB_MAX_HOURS = 4
const MIN_GAP_HOURS = 72
const MAX_SHORT_JOBS_PER_DAY = 2
export const BUSINESS_TIMEZONE = 'America/Edmonton'

export type ExistingAppointment = {
  startsAt: Date
  endsAt: Date
}

function calendarDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60)
}

export type AvailabilityResult = { allowed: true } | { allowed: false; reason: string }

// candidateDurationHours should be the TOTAL on-site time (package +
// add-ons), not just the base package, since add-ons add real time too.
export function checkBookingSpacing(
  candidateStart: Date,
  candidateDurationHours: number,
  existing: ExistingAppointment[]
): AvailabilityResult {
  const candidateEnd = new Date(candidateStart.getTime() + candidateDurationHours * 60 * 60 * 1000)
  const candidateIsShort = candidateDurationHours <= SHORT_JOB_MAX_HOURS
  const candidateDay = calendarDateKey(candidateStart, BUSINESS_TIMEZONE)

  let shortJobsThatDay = 0

  for (const appt of existing) {
    const apptDurationHours = hoursBetween(appt.startsAt, appt.endsAt)
    const apptIsShort = apptDurationHours <= SHORT_JOB_MAX_HOURS
    const apptDay = calendarDateKey(appt.startsAt, BUSINESS_TIMEZONE)
    const sameDay = apptDay === candidateDay

    if (sameDay && apptIsShort) shortJobsThatDay++

    const bothShortSameDay = sameDay && candidateIsShort && apptIsShort
    if (bothShortSameDay) continue // allowed by the short-job exception; day-count checked below

    // Gap is measured end-of-one to start-of-other, whichever ordering applies.
    const gapHours =
      candidateStart >= appt.endsAt
        ? hoursBetween(appt.endsAt, candidateStart)
        : appt.startsAt >= candidateEnd
          ? hoursBetween(candidateEnd, appt.startsAt)
          : 0 // overlapping windows — definitely too close

    if (gapHours < MIN_GAP_HOURS) {
      return {
        allowed: false,
        reason: `That time is too close to another booked job. We need at least ${MIN_GAP_HOURS} hours between jobs to set up properly (unless both jobs are ${SHORT_JOB_MAX_HOURS} hours or less, which can share a day, max ${MAX_SHORT_JOBS_PER_DAY} short jobs/day). Please pick a time at least ${MIN_GAP_HOURS} hours from your other nearby booking.`,
      }
    }
  }

  if (candidateIsShort) {
    if (shortJobsThatDay >= MAX_SHORT_JOBS_PER_DAY) {
      return {
        allowed: false,
        reason: `We can only do ${MAX_SHORT_JOBS_PER_DAY} short jobs (${SHORT_JOB_MAX_HOURS} hours or less) per day, and that day is already full. Please pick a different day.`,
      }
    }
  } else if (shortJobsThatDay > 0) {
    return {
      allowed: false,
      reason: `A job over ${SHORT_JOB_MAX_HOURS} hours can't share a day with another booking. Please pick a different day.`,
    }
  }

  return { allowed: true }
}
