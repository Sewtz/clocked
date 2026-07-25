import { getDb, STORE_SETTINGS } from './db'
import type { Settings } from '@/domain/types'

export async function getSettings(): Promise<Settings | null> {
  const db = await getDb()
  return (await db.get(STORE_SETTINGS, 'settings')) ?? null
}

export async function putSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  await db.put(STORE_SETTINGS, JSON.parse(JSON.stringify(settings)), 'settings')
}
