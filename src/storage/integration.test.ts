import { describe, it, expect, beforeEach } from 'vitest'
import { getEntry, putEntry, deleteEntry, clearAllEntries } from './entries'
import type { Entry } from '@/domain/types'

describe('storage integration', () => {
  beforeEach(async () => { await clearAllEntries() })

  it('round-trips a multi-segment entry', async () => {
    const date = '2026-07-21'
    const entry: Entry = {
      date,
      segments: [
        { type: 'work', start: 1000, end: 2000 },
        { type: 'break', start: 2000, end: 3000, duration: 30 },
        { type: 'work', start: 3000 },
      ],
    }
    await putEntry(entry)
    const fetched = await getEntry(date)
    expect(fetched).toStrictEqual(entry)
  })

  it('handles updates and deletes', async () => {
    const date = '2026-07-22'
    await putEntry({ date, segments: [{ type: 'work', start: 1000 }] })
    let fetched = await getEntry(date)
    expect(fetched?.segments).toHaveLength(1)
    await putEntry({ date, segments: [{ type: 'work', start: 1000 }, { type: 'break', start: 2000, duration: 30 }] })
    fetched = await getEntry(date)
    expect(fetched?.segments).toHaveLength(2)
    await deleteEntry(date)
    expect(await getEntry(date)).toBeUndefined()
  })
})
