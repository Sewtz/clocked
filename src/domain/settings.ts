import type { Settings } from './types'

export function applySettingsPatch(current: Settings, patch: Partial<Settings>): Settings {
  const next = { ...current, ...patch }
  if (!next.break1_enabled) {
    next.break2_enabled = false
  }
  return next
}
