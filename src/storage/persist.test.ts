import { describe, it, expect, vi } from 'vitest'
import { requestPersistence, isPersisted } from './persist'

describe('requestPersistence', () => {
  it('returns false when navigator.storage is undefined', async () => {
    const orig = navigator.storage
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
    expect(await requestPersistence()).toBe(false)
    Object.defineProperty(navigator, 'storage', { value: orig, configurable: true })
  })

  it('returns false when persist rejects', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('fail'))
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    expect(await requestPersistence()).toBe(false)
  })

  it('returns true when navigator.storage.persist resolves true', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    expect(await requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })
})

describe('isPersisted', () => {
  it('returns false when navigator.storage is undefined', async () => {
    const orig = navigator.storage
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
    expect(await isPersisted()).toBe(false)
    Object.defineProperty(navigator, 'storage', { value: orig, configurable: true })
  })

  it('returns false when persisted rejects', async () => {
    const persisted = vi.fn().mockRejectedValue(new Error('fail'))
    Object.defineProperty(navigator, 'storage', { value: { persisted }, configurable: true })
    expect(await isPersisted()).toBe(false)
  })

  it('returns true when navigator.storage.persisted resolves true', async () => {
    const persisted = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { value: { persisted }, configurable: true })
    expect(await isPersisted()).toBe(true)
    expect(persisted).toHaveBeenCalledOnce()
  })
})
