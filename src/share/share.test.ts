import { describe, it, expect, vi } from 'vitest'
import { shareExport, mailtoUrl, MAILTO_MAX_LENGTH, type ShareEnv, type SharePayload } from './share'

const payload: SharePayload = {
  fileName: 'clocked_2026-11-09_2026-11-15.csv',
  csv: '\uFEFFdate;worked\r\n2026-11-09;08:00\r\n',
  subject: 'Working times 2026-11-09 – 2026-11-15',
  text: 'Body with attachment',
  fallbackText: 'Body, please attach the file',
}

function env(nav: ShareEnv['navigator']): ShareEnv & { download: ReturnType<typeof vi.fn>; openUrl: ReturnType<typeof vi.fn> } {
  return { navigator: nav, download: vi.fn(), openUrl: vi.fn() }
}

describe('shareExport', () => {
  it('uses the share sheet with the CSV file, subject and text when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const e = env({ share, canShare: () => true })
    expect(await shareExport(payload, e)).toBe('shared')
    const arg = share.mock.calls[0][0]
    expect(arg.title).toBe(payload.subject)
    expect(arg.text).toBe(payload.text)
    expect(arg.files).toHaveLength(1)
    expect(arg.files[0].name).toBe(payload.fileName)
    expect(arg.files[0].type).toBe('text/csv')
    // The BOM stays in the file (Excel needs it to detect UTF-8)
    expect(await arg.files[0].text()).toBe(payload.csv)
    expect(e.download).not.toHaveBeenCalled()
  })

  it('treats a cancelled share sheet as cancelled, without fallback', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))
    const e = env({ share, canShare: () => true })
    expect(await shareExport(payload, e)).toBe('cancelled')
    expect(e.download).not.toHaveBeenCalled()
    expect(e.openUrl).not.toHaveBeenCalled()
  })

  it('falls back to download + mailto when files cannot be shared', async () => {
    const e = env({ share: vi.fn(), canShare: () => false })
    expect(await shareExport(payload, e)).toBe('downloaded')
    expect(e.download.mock.calls[0][0].name).toBe(payload.fileName)
    const url: string = e.openUrl.mock.calls[0][0]
    expect(url.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(url.split('&body=')[1])).toBe(payload.fallbackText)
  })

  it('falls back when Web Share is missing entirely', async () => {
    const e = env({})
    expect(await shareExport(payload, e)).toBe('downloaded')
  })

  it('falls back when share() is refused (e.g. user activation lost)', async () => {
    const e = env({ share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')), canShare: () => true })
    expect(await shareExport(payload, e)).toBe('downloaded')
    expect(e.download).toHaveBeenCalled()
  })
})

describe('mailtoUrl', () => {
  it('encodes subject and body', () => {
    expect(mailtoUrl('A & B', 'line 1\nline 2')).toBe('mailto:?subject=A%20%26%20B&body=line%201%0Aline%202')
  })

  it('shortens long bodies line by line and says so', () => {
    const body = Array.from({ length: 100 }, (_, i) => `Mon 2026-11-${String(i).padStart(2, '0')}   08:00–16:30   worked 08:00`).join('\n')
    const url = mailtoUrl('Working times', body)
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH)
    const decoded = decodeURIComponent(url.split('&body=')[1])
    expect(decoded.startsWith('Mon 2026-11-00')).toBe(true)
    expect(decoded).toContain('shortened')
  })
})
