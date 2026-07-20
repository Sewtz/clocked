import { describe, it, expect, beforeEach } from 'vitest'
import { getEntry, putEntry, deleteEntry, clearAllEntries } from './entries'
import type { Entry } from '@/domain/types'

beforeEach(async () => {
  await clearAllEntries()
})

describe('entries CRUD', () => {
  it('getEntry returns undefined on fresh DB', async () => {
    expect(await getEntry('2026-07-21')).toBeUndefined()
  })

  it('putEntry then getEntry round-trips', async () => {
    const entry: Entry = {
      date: '2026-07-21',
      segments: [{ type: 'work', start: 1000, end: 2000 }, { type: 'break', start: 2000, end: 3000, duration: 30 }],
    }
    await putEntry(entry)
    const fetched = await getEntry('2026-07-21')
    expect(fetched).toStrictEqual(entry)
  })

  it('deleteEntry removes the row', async () => {
    await putEntry({ date: '2026-07-21', segments: [{ type: 'work', start: 1000 }] })
    await deleteEntry('2026-07-21')
    expect(await getEntry('2026-07-21')).toBeUndefined()
  })

  it('putEntry overwrites existing entry with same date', async () => {
    await putEntry({ date: '2026-07-21', segments: [{ type: 'work', start: 1000 }] })
    const updated: Entry = { date: '2026-07-21', segments: [{ type: 'work', start: 2000 }] }
    await putEntry(updated)
    const fetched = await getEntry('2026-07-21')
    expect(fetched?.segments[0].start).toBe(2000)
  })

  it('multi-segment entry round-trips correctly', async () => {
    const entry: Entry = {
      date: '2026-07-21',
      segments: [
        { type: 'work', start: 1000, end: 2000 },
        { type: 'break', start: 2000, end: 3000, duration: 30 },
        { type: 'work', start: 3000, end: 4000 },
        { type: 'break', start: 4000, duration: 15 },
        { type: 'work', start: 5000 },
      ],
    }
    await putEntry(entry)
    expect(await getEntry('2026-07-21')).toStrictEqual(entry)
  })

  it('clearAllEntries empties the store', async () => {
    await putEntry({ date: '2026-07-21', segments: [{ type: 'work', start: 1000 }] })
    await putEntry({ date: '2026-07-22', segments: [{ type: 'work', start: 2000 }] })
    await clearAllEntries()
    expect(await getEntry('2026-07-21')).toBeUndefined()
    expect(await getEntry('2026-07-22')).toBeUndefined()
  })
})
