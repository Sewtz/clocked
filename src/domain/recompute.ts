import type { Recomputed, Settings, Worktime, BreakState, DerivedSegment } from './types'

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
      segments: [],
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

  const break1Dur = settings.break1_enabled ? settings.break1_duration : 0
  const break2Dur = settings.break2_enabled ? settings.break2_duration : 0
  const b1Trigger = settings.break1_enabled ? settings.break1_trigger : Infinity
  const b2Trigger = settings.break2_enabled ? settings.break2_trigger : Infinity

  let break1SatisfiedByGap = false
  let break2SatisfiedByGap = false
  let gapBreakSeconds = 0

  {
    let need1 = break1Dur > 0
    let need2 = break2Dur > 0
    for (const g of gaps) {
      let remaining = g
      if (need1 && remaining > break1Dur) {
        gapBreakSeconds += break1Dur
        remaining -= break1Dur
        break1SatisfiedByGap = true
        need1 = false
      }
      if (!need1 && need2 && remaining > break2Dur) {
        gapBreakSeconds += break2Dur
        remaining -= break2Dur
        break2SatisfiedByGap = true
        need2 = false
      }
    }
  }

  let breakState: BreakState = 'running'
  let breakEndsAtMs: number | undefined
  let mandatoryBreakSeconds = 0
  let break1Done = break1SatisfiedByGap || break1Dur === 0
  let break2Done = break2SatisfiedByGap || break2Dur === 0

  const segments: DerivedSegment[] = []

  for (const p of punches) {
    const end = p.out ?? nowSec
    segments.push({ type: 'work', startSec: p.in, endSec: end })
  }

  for (let i = 0; i < punches.length - 1; i++) {
    const out = punches[i].out
    if (out !== undefined) {
      const gap = punches[i + 1].in - out
      if (gap > 0) {
        segments.push({ type: 'gap-break', startSec: out, endSec: punches[i + 1].in })
      }
    }
  }

  segments.sort((a, b) => a.startSec - b.startSec)

  if (!(break1Done && break2Done)) {
    let workedElapsed = 0

    for (let pi = 0; pi < punches.length; pi++) {
      const p = punches[pi]
      const end = p.out ?? nowSec
      const dur = end - p.in
      let consumed = 0

      if (!break1Done && workedElapsed < b1Trigger) {
        const toTrigger = b1Trigger - workedElapsed
        if (toTrigger <= dur) {
          consumed += toTrigger
          const triggerSec = p.in + consumed
          const breakEnd = triggerSec + break1Dur
          insertMandatoryBreak(segments, triggerSec, break1Dur, 0)
          mandatoryBreakSeconds += break1Dur
          break1Done = true
          if (nowSec < breakEnd) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break1Dur * 1000
            breakState = 'break1'
            break
          }
          workedElapsed = b1Trigger
        }
      }

      if (!break2Done && break1Done && workedElapsed < b2Trigger) {
        const remainingDur = dur - consumed
        const toTrigger2 = b2Trigger - workedElapsed
        if (toTrigger2 > 0 && toTrigger2 <= remainingDur) {
          consumed += toTrigger2
          const triggerSec = p.in + consumed
          const breakEnd2 = triggerSec + break2Dur
          insertMandatoryBreak(segments, triggerSec, break2Dur, 1)
          mandatoryBreakSeconds += break2Dur
          break2Done = true
          if (nowSec < breakEnd2) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break2Dur * 1000
            breakState = 'break2'
            break
          }
          workedElapsed = b2Trigger
        }
      }

      if (breakEndsAtMs !== undefined) break
      workedElapsed += dur - consumed
    }
  }

  const breakSeconds = gapBreakSeconds + mandatoryBreakSeconds
  const workedSeconds = Math.max(0, workedGross - breakSeconds)

  return {
    workedSeconds,
    breakSeconds,
    displaySeconds: workedSeconds,
    breakState,
    breakEndsAtMs,
    targetReached: workedSeconds >= settings.daily_target,
    limitReached: workedSeconds >= settings.daily_limit,
    segments,
  }
}

function epochMsForSeconds(secondsSinceMidnight: number): number {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  return base.getTime() + secondsSinceMidnight * 1000
}

function insertMandatoryBreak(segments: DerivedSegment[], triggerSec: number, durationSec: number, breakIndex: 0 | 1): void {
  const mb: DerivedSegment = { type: 'mandatory-break', startSec: triggerSec, endSec: triggerSec + durationSec, breakIndex }

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]

    if (s.startSec <= triggerSec && s.endSec > triggerSec) {
      if (s.type === 'work') {
        const endAfter = s.endSec
        segments.splice(i, 1,
          { type: 'work', startSec: s.startSec, endSec: triggerSec },
          mb,
        )
        if (triggerSec + durationSec < endAfter) {
          segments.splice(i + 2, 0, { type: 'work', startSec: triggerSec + durationSec, endSec: endAfter })
        }
        return
      }
      if (s.type === 'gap-break') {
        const endAfter = s.endSec
        if (triggerSec + durationSec < endAfter) {
          segments.splice(i, 1, mb, { type: 'gap-break', startSec: triggerSec + durationSec, endSec: endAfter })
        } else {
          segments.splice(i, 1, mb)
        }
        return
      }
      return
    }

    if (s.startSec === triggerSec) {
      if (s.type === 'work') {
        segments.splice(i, 1,
          mb,
          { type: 'work', startSec: triggerSec + durationSec, endSec: s.endSec },
        )
        return
      }
      if (s.type === 'gap-break') {
        if (triggerSec + durationSec < s.endSec) {
          segments.splice(i, 1, mb, { type: 'gap-break', startSec: triggerSec + durationSec, endSec: s.endSec })
        } else {
          segments.splice(i, 1, mb)
        }
        return
      }
      return
    }
  }
}