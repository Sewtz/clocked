import type { Recomputed, Settings, Worktime, BreakState } from './types'

export function recompute(
  punches: Worktime['punches'],
  settings: Settings,
  nowSec: number,
): Recomputed {
  if (punches.length === 0) {
    return {
      workedSeconds: 0, breakSeconds: 0, displaySeconds: 0,
      breakState: 'running',
      targetReached: false, limitReached: false,
    }
  }

  let workedGross = 0
  const gaps: number[] = []

  for (const p of punches) {
    const end = p.out ?? nowSec
    workedGross += Math.max(0, end - p.in)
  }

  for (let i = 0; i < punches.length - 1; i++) {
    const out = punches[i].out
    if (out !== undefined) {
      const gap = punches[i + 1].in - out
      if (gap > 0) gaps.push(gap)
    }
  }

  const totalGaps = gaps.reduce((a, b) => a + b, 0)

  const break1Dur = settings.break1_enabled ? settings.break1_duration : 0
  const break2Dur = settings.break2_enabled ? settings.break2_duration : 0
  const totalRequired = break1Dur + break2Dur
  const b1Trigger = settings.break1_enabled ? settings.break1_trigger : Infinity
  const b2Trigger = settings.break2_enabled ? settings.break2_trigger : Infinity

  let breakSeconds = totalGaps
  let mandatoryPauseSeconds = 0
  let breakEndsAtMs: number | undefined
  let breakState: BreakState = 'running'
  let break1Done = false
  let break2Done = false

  if (totalGaps < totalRequired) {
    mandatoryPauseSeconds = totalRequired - totalGaps

    let workedElapsed = 0

    for (let pi = 0; pi < punches.length && breakEndsAtMs === undefined; pi++) {
      const p = punches[pi]
      const end = p.out ?? nowSec
      const dur = end - p.in

      let consumed = 0

      if (!break1Done && workedElapsed < b1Trigger) {
        const toTrigger = b1Trigger - workedElapsed
        if (toTrigger <= dur) {
          break1Done = true
          consumed += toTrigger

          const mandatory1 = Math.min(mandatoryPauseSeconds, break1Dur)
          if (mandatory1 > 0) {
            const triggerInstantMs = epochMsForSeconds(p.in + consumed)
            breakEndsAtMs = triggerInstantMs + mandatory1 * 1000
            breakState = 'break1'
            mandatoryPauseSeconds -= mandatory1
          }

          if (breakEndsAtMs === undefined) {
            workedElapsed = b1Trigger
            const remaining = dur - consumed
            const pause1 = Math.min(mandatoryPauseSeconds, break1Dur - mandatory1)
            if (pause1 > 0) {
              breakEndsAtMs = epochMsForSeconds(p.in + consumed) + pause1 * 1000
              breakState = 'break1'
              mandatoryPauseSeconds -= pause1
            } else {
              workedElapsed += remaining
              consumed = dur
            }
          }
        }
      }

      if (breakEndsAtMs !== undefined) break

      if (break1Done && !break2Done && workedElapsed < b2Trigger) {
        const remainingDur = dur - consumed
        const toTrigger2 = b2Trigger - workedElapsed
        if (toTrigger2 > 0 && toTrigger2 <= remainingDur) {
          break2Done = true
          consumed += toTrigger2

          const mandatory2 = Math.min(mandatoryPauseSeconds, break2Dur)
          if (mandatory2 > 0) {
            const triggerInstantMs = epochMsForSeconds(p.in + consumed)
            breakEndsAtMs = triggerInstantMs + mandatory2 * 1000
            breakState = 'break2'
            mandatoryPauseSeconds -= mandatory2
          }

          if (breakEndsAtMs === undefined) {
            workedElapsed = b2Trigger
            const remaining = dur - consumed
            const pause2 = Math.min(mandatoryPauseSeconds, break2Dur - mandatory2)
            if (pause2 > 0) {
              breakEndsAtMs = epochMsForSeconds(p.in + consumed) + pause2 * 1000
              breakState = 'break2'
              mandatoryPauseSeconds -= pause2
            } else {
              workedElapsed += remaining
            }
          }
        }
      }

      if (breakEndsAtMs !== undefined) break

      workedElapsed += dur - consumed
    }
  }

  breakSeconds = totalGaps + (totalRequired - totalGaps - mandatoryPauseSeconds)
  const workedSeconds = Math.max(0, workedGross - breakSeconds)

  return {
    workedSeconds,
    breakSeconds,
    displaySeconds: workedSeconds,
    breakState,
    breakEndsAtMs,
    targetReached: workedSeconds >= settings.daily_target,
    limitReached: workedSeconds >= settings.daily_limit,
  }
}

function epochMsForSeconds(secondsSinceMidnight: number): number {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  return base.getTime() + secondsSinceMidnight * 1000
}
