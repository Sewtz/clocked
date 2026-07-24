import type { Settings, Worktime } from '@/domain/types'

declare global {
  interface Window {
    __clocked: {
      help(): void
      readonly state: {
        settings: Settings | null
        worktime: Worktime | null
        now: number
        worked: number
        display: number
        breakState: string
        breakEndsAt: number | undefined
        viewState: string
        targetReached: boolean
        limitReached: boolean
      }
      readonly settings: Settings | null
      setSettings(patch: Partial<Settings>): Promise<void>
      resetSettings(): Promise<void>
      readonly worktime: Worktime | null
      punchIn(sec?: number): Promise<void>
      punchOut(): Promise<void>
      setPunches(punches: Array<{ in: number; out?: number }>): Promise<void>
      clear(): Promise<void>
      tickTo(sec: number): void
      tickForward(sec: number): void
      useRealClock(): void
      simulateMidnight(): Promise<void>
    }
  }
}

export {}
