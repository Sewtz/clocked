export type ClockFn = () => number

let nowFn: ClockFn = () => Date.now()

export function setClock(fn: ClockFn | null): void {
  nowFn = fn ?? (() => Date.now())
}

export function now(): number {
  return nowFn()
}
