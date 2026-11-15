export interface Settings {
  daily_target: number
  daily_limit: number
  break1_enabled: boolean
  break1_trigger: number
  break1_duration: number
  break2_enabled: boolean
  break2_trigger: number
  break2_duration: number
}

export const DEFAULT_SETTINGS: Settings = {
  daily_target: 28800,
  daily_limit: 36000,
  break1_enabled: true,
  break1_trigger: 21600,
  break1_duration: 1800,
  break2_enabled: true,
  break2_trigger: 32400,
  break2_duration: 900,
}

/** A work interval derived from a valid event sequence; consumed by `recompute`. */
export interface Punch {
  in: number
  out?: number
}

export interface Worktime {
  date: string
  punches: Punch[]
}

export type PunchEventType = 'in' | 'out'

/** One clock-in or clock-out at `t` seconds since local midnight. */
export interface PunchEvent {
  type: PunchEventType
  t: number
}

export type AnalysisIssueKind =
  | 'starts-with-out'
  | 'double-in'
  | 'double-out'
  | 'open-past-day'
  | 'unsorted'

export interface AnalysisIssue {
  /** Index of the event that makes the sequence faulty. */
  index: number
  kind: AnalysisIssueKind
}

export type Analysis =
  | { status: 'valid'; punches: Punch[]; open: boolean }
  | { status: 'faulty'; issues: AnalysisIssue[] }

export type BreakState = 'running' | 'break1' | 'break2'

export type DerivedSegmentType = 'work' | 'gap' | 'mandatory-break'

export interface DerivedSegment {
  type: DerivedSegmentType
  startSec: number
  endSec: number
  breakIndex?: 0 | 1
}

export interface Recomputed {
  workedSeconds: number
  breakSeconds: number
  displaySeconds: number
  breakState: BreakState
  breakEndsAtMs?: number
  targetReached: boolean
  limitReached: boolean
  segments: DerivedSegment[]
}

export type ViewState =
  | { kind: 'clock-in' }
  | { kind: 'running' }
  | { kind: 'break' }
  | { kind: 'clocked-out' }
