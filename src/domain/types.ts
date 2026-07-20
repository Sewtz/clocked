export type BreakDuration = 30 | 15

export interface WorkSegment {
  type: 'work'
  start: number
  end?: number
}

export interface BreakSegment {
  type: 'break'
  start: number
  end?: number
  duration: BreakDuration
}

export type Segment = WorkSegment | BreakSegment

export interface Entry {
  date: string
  segments: Segment[]
}

export type BreakState = 'running' | 'break30' | 'break15'

export interface ClockState {
  state: BreakState
  workedMs: number
  displayMs: number
  breakEndsAt?: number
  currentSegment: Segment
}

export type ViewState =
  | { kind: 'clock-in' }
  | { kind: 'running' }
  | { kind: 'break' }
  | { kind: 'clocked-out' }
