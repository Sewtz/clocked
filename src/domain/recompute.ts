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

  interface GapInfo {
    start: number
    end: number
    duration: number
  }
  const gaps: GapInfo[] = []

  for (const p of punches) {
    const end = p.out ?? nowSec
    workedGross += Math.max(0, end - p.in)
  }

  for (let i = 0; i < punches.length - 1; i++) {
    const out = punches[i].out
    if (out !== undefined) {
      const gap = punches[i + 1].in - out
      if (gap > 0) gaps.push({ start: out, end: punches[i + 1].in, duration: gap })
    }
  }

  const break1Dur = settings.break1_enabled ? settings.break1_duration : 0
  const break2Dur = settings.break2_enabled ? settings.break2_duration : 0
  const b1Trigger = settings.break1_enabled ? settings.break1_trigger : Infinity
  const b2Trigger = settings.break2_enabled ? settings.break2_trigger : Infinity

  let break1SatisfiedByGap = false
  let break2SatisfiedByGap = false
  let mandatoryBreakSeconds = 0

  interface GapFit {
    breakIndex: 0 | 1
    duration: number
  }
  const gapFits = new Map<number, GapFit[]>()

  {
let need1 = break1Dur > 0
      let need2 = break2Dur > 0
      for (const g of gaps) {
        const fits: GapFit[] = []
        let remaining = g.duration

        if (need1 && remaining >= break1Dur) {
          fits.push({ breakIndex: 0, duration: break1Dur })
          mandatoryBreakSeconds += break1Dur
          remaining -= break1Dur
          break1SatisfiedByGap = true
          need1 = false
        }
        if (!need1 && need2 && remaining >= break2Dur) {
          fits.push({ breakIndex: 1, duration: break2Dur })
          mandatoryBreakSeconds += break2Dur
          remaining -= break2Dur
          break2SatisfiedByGap = true
          need2 = false
        }
        if (fits.length > 0) {
          gapFits.set(g.start, fits)
        }
      }
    }

  let breakState: BreakState = 'running'
  let breakEndsAtMs: number | undefined
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
      const gapStart = out
      const gapEnd = punches[i + 1].in
      const gapDur = gapEnd - gapStart
      if (gapDur > 0) {
        const fits = gapFits.get(gapStart) ?? []
        let pos = gapStart
        for (const fit of fits) {
          segments.push({ type: 'mandatory-break', startSec: pos, endSec: pos + fit.duration, breakIndex: fit.breakIndex })
          pos += fit.duration
        }
        if (pos < gapEnd) {
          segments.push({ type: 'gap', startSec: pos, endSec: gapEnd })
        }
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
          const elapsedBreak = nowSec < breakEnd ? nowSec - triggerSec : break1Dur
          mandatoryBreakSeconds += elapsedBreak
          break1Done = true
          if (nowSec < breakEnd) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break1Dur * 1000
            breakState = 'break1'
            break
          }
          consumed += break1Dur
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
          const elapsedBreak2 = nowSec < breakEnd2 ? nowSec - triggerSec : break2Dur
          mandatoryBreakSeconds += elapsedBreak2
          break2Done = true
          if (nowSec < breakEnd2) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break2Dur * 1000
            breakState = 'break2'
            break
          }
          consumed += break2Dur
          workedElapsed = b2Trigger
        }
      }

      if (breakEndsAtMs !== undefined) break
      workedElapsed += dur - consumed
    }
  }

  const breakSeconds = mandatoryBreakSeconds
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
      if (s.type === 'gap') {
        const endAfter = s.endSec
        if (triggerSec + durationSec < endAfter) {
          segments.splice(i, 1, mb, { type: 'gap', startSec: triggerSec + durationSec, endSec: endAfter })
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
      if (s.type === 'gap') {
        if (triggerSec + durationSec < s.endSec) {
          segments.splice(i, 1, mb, { type: 'gap', startSec: triggerSec + durationSec, endSec: s.endSec })
        } else {
          segments.splice(i, 1, mb)
        }
        return
      }
      return
    }
  }
}