export function formatHHMM(ms: number): string {
  if (ms < 0) return '00:00'
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatMMSS(ms: number): string {
  if (ms < 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const SECONDS_PER_DAY = 86400

export function secToTimeInput(sec: number): string {
  const clamped = Math.max(0, Math.min(SECONDS_PER_DAY - 1, Math.round(sec)))
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function timeInputToSec(value: string): number {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (!m) return 0
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return Math.max(0, Math.min(SECONDS_PER_DAY - 1, h * 3600 + min * 60))
}
