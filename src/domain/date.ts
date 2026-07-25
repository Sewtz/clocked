export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isExpired(entryDate: string, now: Date = new Date()): boolean {
  return entryDate !== todayString(now)
}

export function localEpochForTodayMs(
  hours: number,
  minutes: number,
  now: Date = new Date(),
): number {
  const d = new Date(now)
  d.setHours(hours, minutes, 0, 0)
  return d.getTime()
}

export function secondsSinceMidnight(epochMs: number): number {
  const d = new Date(epochMs)
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}
