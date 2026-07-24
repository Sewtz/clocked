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

export interface Worktime {
  date: string
  punches: Array<{ in: number; out?: number }>
}

export type BreakState = 'running' | 'break1' | 'break2'

export type DerivedSegmentType = 'work' | 'gap-break' | 'mandatory-break'

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
