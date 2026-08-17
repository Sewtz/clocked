import { describe, it, expect, beforeEach } from 'vitest'
import {
  getHistoryDay,
  putHistoryDay,
  deleteHistoryDay,
  getAllHistory,
  getHistoryRange,
  clearHistory,
} from './history'

const DAY_A: WorktimeFixture = { date: '2026-08-03', punches: [{ in: 28800, out: 32400 }] }
const DAY_B: WorktimeFixture = { date: '2026-08-17', punches: [{ in: 28800 }, { in: 36000, out: 43200 }] }

interface WorktimeFixture {
  date: string
  punches: Array<{ in: number; out?: number }>
}

beforeEach(async () => {
  await clearHistory()
})

describe('getHistoryDay', () => {
  it('returns null on empty DB', async () => {
    expect(await getHistoryDay('2026-08-17')).toBeNull()
  })

  it('returns null for a missing date after other writes', async () => {
    await putHistoryDay(DAY_A)
    expect(await getHistoryDay('2026-08-17')).toBeNull()
  })
})

describe('putHistoryDay', () => {
  it('round-trips a record', async () => {
    await putHistoryDay(DAY_A)
    expect(await getHistoryDay('2026-08-03')).toStrictEqual(DAY_A)
  })

  it('overwrites an existing record for the same date', async () => {
    await putHistoryDay({ date: '2026-08-03', punches: [{ in: 0, out: 1 }] })
    await putHistoryDay(DAY_A)
    expect(await getHistoryDay('2026-08-03')).toStrictEqual(DAY_A)
  })
})

describe('deleteHistoryDay', () => {
  it('removes the record', async () => {
    await putHistoryDay(DAY_A)
    await deleteHistoryDay('2026-08-03')
    expect(await getHistoryDay('2026-08-03')).toBeNull()
  })
})

describe('getAllHistory', () => {
  it('returns all records', async () => {
    await putHistoryDay(DAY_A)
    await putHistoryDay(DAY_B)
    const all = await getAllHistory()
    expect(all).toHaveLength(2)
    expect(all).toContainEqual(DAY_A)
    expect(all).toContainEqual(DAY_B)
  })

  it('returns empty array on empty DB', async () => {
    expect(await getAllHistory()).toEqual([])
  })
})

describe('getHistoryRange', () => {
  it('returns only records within the inclusive range', async () => {
    await putHistoryDay({ date: '2026-08-02', punches: [{ in: 0, out: 1 }] })
    await putHistoryDay(DAY_A)
    await putHistoryDay(DAY_B)
    await putHistoryDay({ date: '2026-08-30', punches: [{ in: 0, out: 1 }] })
    const result = await getHistoryRange('2026-08-03', '2026-08-17')
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['2026-08-03']).toStrictEqual(DAY_A)
    expect(result['2026-08-17']).toStrictEqual(DAY_B)
  })

  it('returns empty object when nothing in range', async () => {
    await putHistoryDay({ date: '2026-09-01', punches: [{ in: 0, out: 1 }] })
    expect(await getHistoryRange('2026-08-03', '2026-08-17')).toEqual({})
  })
})

describe('clearHistory', () => {
  it('empties the store', async () => {
    await putHistoryDay(DAY_A)
    await putHistoryDay(DAY_B)
    await clearHistory()
    expect(await getAllHistory()).toEqual([])
  })
})