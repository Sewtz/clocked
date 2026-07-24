import { useState, useEffect, useCallback } from 'react'

type SessionType = 'work' | 'break'

interface Session {
  id: string
  type: SessionType
  start: Date
  end?: Date
  autoBreakDuration?: number
}

interface AutoBreakRule {
  enabled: boolean
  triggerHours: number   // worked hours before this break fires
  durationMinutes: number
}

interface Settings {
  targetHours: number
  autoBreaks: [AutoBreakRule, AutoBreakRule]
}

const DEFAULT_SETTINGS: Settings = {
  targetHours: 8,
  autoBreaks: [
    { enabled: true, triggerHours: 6, durationMinutes: 30 },
    { enabled: true, triggerHours: 9, durationMinutes: 15 },
  ],
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatHM(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── Settings dialog ───────────────────────────────────────────────────────────

interface SettingsDialogProps {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={e => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
      className="font-mono text-sm w-20 bg-[#111] border border-[#2a2a2a] text-[#e8e8e8] px-2 py-1 text-right focus:outline-none focus:border-[#b8ff57] disabled:opacity-30 disabled:cursor-not-allowed"
    />
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-9 h-5 flex-shrink-0 transition-colors duration-200 focus:outline-none"
      style={{ backgroundColor: value ? '#b8ff57' : '#222' }}
      role="switch"
      aria-checked={value}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#0a0a0a] transition-transform duration-200"
        style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  )
}

function SettingsDialog({ settings, onSave, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings>(JSON.parse(JSON.stringify(settings)))

  const setBreak = (i: 0 | 1, patch: Partial<AutoBreakRule>) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as Settings
      next.autoBreaks[i] = { ...next.autoBreaks[i], ...patch }
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0f0f0f] border border-[#2a2a2a] w-full max-w-md mx-4">
        {/* Dialog header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <span className="font-mono text-xs tracking-widest text-[#666] uppercase">Settings</span>
          <button
            onClick={onClose}
            className="font-mono text-[#444] hover:text-[#999] text-lg leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-8">
          {/* Daily target */}
          <section>
            <div className="font-mono text-[10px] tracking-widest text-[#444] uppercase mb-4">Daily target</div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-[#999]">Target work hours</span>
              <div className="flex items-center gap-2">
                <NumberInput
                  value={draft.targetHours}
                  onChange={v => setDraft(prev => ({ ...prev, targetHours: v }))}
                  min={1}
                  max={24}
                  step={0.5}
                />
                <span className="font-mono text-xs text-[#444]">h</span>
              </div>
            </div>
          </section>

          {/* Auto-break rules */}
          <section>
            <div className="font-mono text-[10px] tracking-widest text-[#444] uppercase mb-4">Automatic breaks</div>
            <div className="flex flex-col gap-5">
              {([0, 1] as const).map(i => {
                const rule = draft.autoBreaks[i]
                return (
                  <div key={i} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-[#999]">Break {i + 1}</span>
                      <Toggle value={rule.enabled} onChange={v => setBreak(i, { enabled: v })} />
                    </div>
                    <div
                      className="flex flex-col gap-3 pl-4 border-l transition-opacity duration-200"
                      style={{
                        borderColor: rule.enabled ? '#2a2a2a' : '#1a1a1a',
                        opacity: rule.enabled ? 1 : 0.35,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-[#666]">Trigger after</span>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            value={rule.triggerHours}
                            onChange={v => setBreak(i, { triggerHours: v })}
                            min={0.5}
                            max={23}
                            step={0.5}
                            disabled={!rule.enabled}
                          />
                          <span className="font-mono text-xs text-[#444]">h worked</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-[#666]">Break duration</span>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            value={rule.durationMinutes}
                            onChange={v => setBreak(i, { durationMinutes: v })}
                            min={1}
                            max={120}
                            step={1}
                            disabled={!rule.enabled}
                          />
                          <span className="font-mono text-xs text-[#444]">min</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#1e1e1e]">
          <button
            onClick={onClose}
            className="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-[#2a2a2a] text-[#555] hover:text-[#999] hover:border-[#555] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose() }}
            className="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-[#b8ff57] text-[#0a0a0a] font-bold hover:bg-[#c8ff77] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadState(): { sessions: Session[]; autoBreaksFired: (0 | 1)[] } {
  try {
    const raw = localStorage.getItem('timeclock-day')
    if (!raw) return { sessions: [], autoBreaksFired: [] }
    const parsed = JSON.parse(raw)
    if (parsed.date !== todayKey()) return { sessions: [], autoBreaksFired: [] }
    return {
      sessions: (parsed.sessions ?? []).map((s: Session) => ({
        ...s,
        start: new Date(s.start),
        end: s.end ? new Date(s.end) : undefined,
      })),
      autoBreaksFired: parsed.autoBreaksFired ?? [],
    }
  } catch {
    return { sessions: [], autoBreaksFired: [] }
  }
}

function saveState(sessions: Session[], autoBreaksFired: Set<0 | 1>) {
  localStorage.setItem('timeclock-day', JSON.stringify({
    date: todayKey(),
    sessions,
    autoBreaksFired: [...autoBreaksFired],
  }))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('timeclock-settings')
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ── Main app ──────────────────────────────────────────────────────────────────

export default function App() {
  const initial = loadState()
  const [sessions, setSessions] = useState<Session[]>(initial.sessions)
  const [now, setNow] = useState<Date>(new Date())
  // Derive initial status from the last session
  const [status, setStatus] = useState<'idle' | 'working' | 'break'>(() => {
    const last = initial.sessions[initial.sessions.length - 1]
    if (!last || last.end) return 'idle'
    return last.type === 'work' ? 'working' : 'break'
  })
  const [autoBreaksFired, setAutoBreaksFired] = useState<Set<0 | 1>>(new Set(initial.autoBreaksFired))
  const [settings, setSettings] = useState<Settings>(loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, setCurrentDay] = useState<string>(todayKey())

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
      // Midnight reset
      const day = todayKey()
      setCurrentDay(prev => {
        if (prev !== day) {
          setSessions([])
          setAutoBreaksFired(new Set())
          setStatus('idle')
          saveState([], new Set())
        }
        return day
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Persist sessions and fired breaks whenever they change
  useEffect(() => { saveState(sessions, autoBreaksFired) }, [sessions, autoBreaksFired])

  // Persist settings whenever they change
  useEffect(() => {
    localStorage.setItem('timeclock-settings', JSON.stringify(settings))
  }, [settings])

  const lastSession = sessions[sessions.length - 1]

  const totalWork = sessions.reduce((acc, s) => {
    if (s.type !== 'work') return acc
    const end = s.end ?? now
    return acc + (end.getTime() - s.start.getTime())
  }, 0)

  const totalBreak = sessions.reduce((acc, s) => {
    if (s.type !== 'break') return acc
    const end = s.end ?? now
    return acc + (end.getTime() - s.start.getTime())
  }, 0)

  const currentSessionMs = lastSession && !lastSession.end
    ? now.getTime() - lastSession.start.getTime()
    : 0

  const autoBreakRemaining = lastSession?.autoBreakDuration
    ? Math.max(0, lastSession.autoBreakDuration - currentSessionMs)
    : null

  const startTime = sessions[0]?.start ?? null
  const daySpanMs = startTime ? now.getTime() - startTime.getTime() : 0
  const targetMs = settings.targetHours * 60 * 60 * 1000
  const workPercent = Math.min((totalWork / targetMs) * 100, 100)
  const overtime = totalWork > targetMs ? totalWork - targetMs : 0

  // Auto-break logic
  useEffect(() => {
    if (status !== 'working' && status !== 'break') return

    for (const i of [0, 1] as const) {
      const rule = settings.autoBreaks[i]
      if (!rule.enabled) continue
      const thresholdMs = rule.triggerHours * 60 * 60 * 1000
      if (status === 'working' && totalWork >= thresholdMs && !autoBreaksFired.has(i)) {
        setAutoBreaksFired(prev => new Set([...prev, i]))
        setSessions(prev => {
          const updated = [...prev]
          if (updated.length > 0 && !updated[updated.length - 1].end) {
            updated[updated.length - 1] = { ...updated[updated.length - 1], end: new Date() }
          }
          return [...updated, {
            id: crypto.randomUUID(),
            type: 'break',
            start: new Date(),
            autoBreakDuration: rule.durationMinutes * 60 * 1000,
          }]
        })
        setStatus('break')
        return
      }
    }

    if (
      status === 'break' &&
      lastSession?.autoBreakDuration &&
      currentSessionMs >= lastSession.autoBreakDuration
    ) {
      setSessions(prev => {
        const updated = [...prev]
        if (updated.length > 0 && !updated[updated.length - 1].end) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], end: new Date() }
        }
        return [...updated, { id: crypto.randomUUID(), type: 'work', start: new Date() }]
      })
      setStatus('working')
    }
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClockIn = useCallback(() => {
    setSessions(prev => [
      ...prev,
      { id: crypto.randomUUID(), type: 'work', start: new Date() },
    ])
    setStatus('working')
  }, [])

  const handleBreak = useCallback(() => {
    setSessions(prev => {
      const updated = [...prev]
      if (updated.length > 0 && !updated[updated.length - 1].end) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], end: new Date() }
      }
      return [...updated, { id: crypto.randomUUID(), type: 'break', start: new Date() }]
    })
    setStatus('break')
  }, [])

  const handleResume = useCallback(() => {
    setSessions(prev => {
      const updated = [...prev]
      if (updated.length > 0 && !updated[updated.length - 1].end) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], end: new Date() }
      }
      return [...updated, { id: crypto.randomUUID(), type: 'work', start: new Date() }]
    })
    setStatus('working')
  }, [])

  const handleClockOut = useCallback(() => {
    setSessions(prev => {
      const updated = [...prev]
      if (updated.length > 0 && !updated[updated.length - 1].end) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], end: new Date() }
      }
      return updated
    })
    setStatus('idle')
  }, [])

  const segments = sessions.map(s => {
    const segStart = s.start.getTime() - (startTime?.getTime() ?? 0)
    const segEnd = (s.end ?? now).getTime() - (startTime?.getTime() ?? 0)
    const left = daySpanMs > 0 ? (segStart / daySpanMs) * 100 : 0
    const width = daySpanMs > 0 ? ((segEnd - segStart) / daySpanMs) * 100 : 0
    return { ...s, left, width }
  })

  // Next upcoming auto-break milestone
  const nextMilestone = settings.autoBreaks
    .map((rule, i) => ({ rule, i: i as 0 | 1 }))
    .filter(({ rule, i }) => rule.enabled && !autoBreaksFired.has(i))
    .map(({ rule }) => ({
      label: `${rule.triggerHours}h auto-break`,
      remaining: rule.triggerHours * 60 * 60 * 1000 - totalWork,
    }))
    .filter(m => m.remaining > 0)[0] ?? null

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] font-sans flex flex-col">
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onSave={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Header */}
      <header className="border-b border-[#1e1e1e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full transition-colors duration-300"
            style={{ backgroundColor: status === 'working' ? '#b8ff57' : status === 'break' ? '#ffa94d' : '#3a3a3a' }}
          />
          <span className="font-mono text-xs tracking-widest text-[#666] uppercase">Timeclock</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#444]">
            {now.toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[#333] hover:text-[#999] transition-colors"
            aria-label="Settings"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-12">

        {/* Big clock */}
        <div className="text-center">
          <div
            className="font-mono text-[4.5rem] leading-none tracking-tight transition-colors duration-300"
            style={{ color: status === 'working' ? '#b8ff57' : status === 'break' ? '#ffa94d' : '#2a2a2a' }}
          >
            {status !== 'idle' ? formatDuration(currentSessionMs) : '00:00:00'}
          </div>
          <div className="font-mono text-xs text-[#444] mt-2 tracking-widest uppercase">
            {status === 'working'
              ? 'Current session'
              : status === 'break'
              ? lastSession?.autoBreakDuration
                ? `Auto break — resumes in ${formatCountdown(autoBreakRemaining ?? 0)}`
                : 'On break'
              : 'Not clocked in'}
          </div>
        </div>

        {/* Auto-break countdown banner */}
        {lastSession?.autoBreakDuration && status === 'break' && (
          <div className="w-full max-w-xl border border-[#ffa94d]/30 bg-[#ffa94d]/5 px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-xs text-[#ffa94d] tracking-widest uppercase">
              Statutory break ({lastSession.autoBreakDuration / 60000} min)
            </span>
            <div className="flex items-center gap-4">
              <div className="h-1 w-32 bg-[#1a1a1a] overflow-hidden">
                <div
                  className="h-full bg-[#ffa94d] transition-all duration-1000"
                  style={{ width: `${Math.max(0, 100 - (currentSessionMs / lastSession.autoBreakDuration) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-sm text-[#ffa94d] font-bold">
                {formatCountdown(autoBreakRemaining ?? 0)}
              </span>
            </div>
          </div>
        )}

        {/* Next milestone hint */}
        {status === 'working' && nextMilestone && nextMilestone.remaining > 0 && (
          <div className="w-full max-w-xl flex items-center justify-between px-1">
            <span className="font-mono text-xs text-[#333] tracking-widest uppercase">Next: {nextMilestone.label}</span>
            <span className="font-mono text-xs text-[#333]">in {formatHM(nextMilestone.remaining)}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {status === 'idle' && (
            <button
              onClick={handleClockIn}
              className="font-mono text-sm tracking-widest uppercase px-8 py-3 bg-[#b8ff57] text-[#0a0a0a] font-bold transition-all duration-150 hover:bg-[#c8ff77] active:scale-95"
            >
              Clock In
            </button>
          )}
          {status === 'working' && (
            <>
              <button
                onClick={handleBreak}
                className="font-mono text-sm tracking-widest uppercase px-6 py-3 border border-[#ffa94d] text-[#ffa94d] transition-all duration-150 hover:bg-[#ffa94d]/10 active:scale-95"
              >
                Break
              </button>
              <button
                onClick={handleClockOut}
                className="font-mono text-sm tracking-widest uppercase px-6 py-3 border border-[#3a3a3a] text-[#666] transition-all duration-150 hover:border-[#666] hover:text-[#999] active:scale-95"
              >
                Clock Out
              </button>
            </>
          )}
          {status === 'break' && (
            <>
              <button
                onClick={handleResume}
                className="font-mono text-sm tracking-widest uppercase px-8 py-3 bg-[#b8ff57] text-[#0a0a0a] font-bold transition-all duration-150 hover:bg-[#c8ff77] active:scale-95"
              >
                Resume
              </button>
              <button
                onClick={handleClockOut}
                className="font-mono text-sm tracking-widest uppercase px-6 py-3 border border-[#3a3a3a] text-[#666] transition-all duration-150 hover:border-[#666] hover:text-[#999] active:scale-95"
              >
                Clock Out
              </button>
            </>
          )}
        </div>

        {/* Stats row */}
        <div className="w-full max-w-xl grid grid-cols-3 gap-px bg-[#1a1a1a]">
          <div className="bg-[#0a0a0a] px-5 py-4">
            <div className="font-mono text-[#b8ff57] text-xl font-bold">{formatHM(totalWork)}</div>
            <div className="font-mono text-[#444] text-xs mt-1 tracking-widest uppercase">Worked</div>
          </div>
          <div className="bg-[#0a0a0a] px-5 py-4">
            <div className="font-mono text-[#ffa94d] text-xl font-bold">{formatHM(totalBreak)}</div>
            <div className="font-mono text-[#444] text-xs mt-1 tracking-widest uppercase">Breaks</div>
          </div>
          <div className="bg-[#0a0a0a] px-5 py-4">
            <div
              className="font-mono text-xl font-bold"
              style={{ color: overtime > 0 ? '#ff6b6b' : '#444' }}
            >
              {overtime > 0 ? `+${formatHM(overtime)}` : formatHM(Math.max(0, targetMs - totalWork))}
            </div>
            <div className="font-mono text-[#444] text-xs mt-1 tracking-widest uppercase">
              {overtime > 0 ? 'Overtime' : 'Remaining'}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xl">
          <div className="flex justify-between mb-2">
            <span className="font-mono text-xs text-[#444] tracking-widest uppercase">Daily target</span>
            <span className="font-mono text-xs text-[#444]">{Math.round(workPercent)}% of {settings.targetHours}h</span>
          </div>
          <div className="h-2 bg-[#1a1a1a] w-full overflow-hidden">
            <div
              className="h-full transition-all duration-1000"
              style={{
                width: `${workPercent}%`,
                backgroundColor: workPercent >= 100 ? '#ff6b6b' : '#b8ff57',
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px] text-[#2a2a2a]">0h</span>
            <span className="font-mono text-[10px] text-[#2a2a2a]">{settings.targetHours / 2}h</span>
            <span className="font-mono text-[10px] text-[#2a2a2a]">{settings.targetHours}h</span>
          </div>
        </div>

        {/* Timeline */}
        {sessions.length > 0 && (
          <div className="w-full max-w-xl">
            <div className="flex justify-between mb-2">
              <span className="font-mono text-xs text-[#444] tracking-widest uppercase">Timeline</span>
              <span className="font-mono text-xs text-[#444]">
                {startTime ? formatTime(startTime) : ''} → {formatTime(now)}
              </span>
            </div>
            <div className="relative h-8 bg-[#111] w-full overflow-hidden">
              {segments.map(seg => (
                <div
                  key={seg.id}
                  className="absolute top-0 h-full transition-all duration-500"
                  style={{
                    left: `${seg.left}%`,
                    width: `${seg.width}%`,
                    backgroundColor: seg.type === 'work' ? '#b8ff57' : '#ffa94d',
                    opacity: seg.type === 'work' ? 0.9 : 0.7,
                  }}
                  title={`${seg.type === 'work' ? 'Work' : 'Break'}: ${formatTime(seg.start)} – ${seg.end ? formatTime(seg.end) : 'now'}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-px">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 font-mono text-xs text-[#555]">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.type === 'work' ? '#b8ff57' : '#ffa94d' }}
                  />
                  <span className="w-10 uppercase tracking-widest" style={{ color: s.type === 'work' ? '#b8ff57' : '#ffa94d' }}>
                    {s.type === 'work' ? 'Work' : 'Brk'}
                  </span>
                  {s.autoBreakDuration && (
                    <span className="text-[#333] uppercase tracking-widest text-[10px]">auto</span>
                  )}
                  <span>
                    {formatTime(s.start)} → {s.end ? formatTime(s.end) : <span className="text-[#333]">ongoing</span>}
                  </span>
                  <span className="ml-auto">
                    {formatHM((s.end ?? now).getTime() - s.start.getTime())}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'idle' && sessions.length === 0 && (
          <div className="font-mono text-xs text-[#2a2a2a] tracking-widest uppercase">
            Press clock in to start tracking
          </div>
        )}
      </main>
    </div>
  )
}
