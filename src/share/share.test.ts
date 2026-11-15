import { describe, it, expect, vi } from 'vitest'
import { shareExport, fittingMailtoUrl, downloadFile, csvFile, MAILTO_MAX_LENGTH, type ShareEnv, type SharePayload } from './share'

const payload: SharePayload = {
  fileName: 'clocked_2026-11-09_2026-11-15.csv',
  csv: '\uFEFFdate;worked\r\n2026-11-09;08:00\r\n',
  subject: 'Working times 2026-11-09 – 2026-11-15',
  text: 'Table + see the attached file',
  draftText: () => 'Day | Worked\nMon | 08:00',
}

function env(nav: ShareEnv['navigator']): ShareEnv & { openUrl: ReturnType<typeof vi.fn> } {
  return { navigator: nav, openUrl: vi.fn() }
}
const body = (url: string) => decodeURIComponent(url.split('&body=')[1])

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
    expect(e.openUrl).not.toHaveBeenCalled()
  })

  it('treats a cancelled share sheet as cancelled, without a draft', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))
    const e = env({ share, canShare: () => true })
    expect(await shareExport(payload, e)).toBe('cancelled')
    expect(e.openUrl).not.toHaveBeenCalled()
  })

  it('opens a mail draft with the table, and no file, when files cannot be shared', async () => {
    const e = env({ share: vi.fn(), canShare: () => false })
    expect(await shareExport(payload, e)).toBe('draft')
    const url: string = e.openUrl.mock.calls[0][0]
    expect(url.startsWith('mailto:?subject=Working%20times%202026-11-09')).toBe(true)
    expect(body(url)).toBe('Day | Worked\nMon | 08:00')
  })

  it('opens a draft when Web Share is missing entirely', async () => {
    const e = env({})
    expect(await shareExport(payload, e)).toBe('draft')
    expect(e.openUrl).toHaveBeenCalledOnce()
  })

  it('opens a draft when share() is refused (e.g. user activation lost)', async () => {
    const e = env({ share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')), canShare: () => true })
    expect(await shareExport(payload, e)).toBe('draft')
  })
})

describe('fittingMailtoUrl', () => {
  const longText = (maxDayRows?: number) => {
    const rows = Array.from({ length: 200 }, (_, i) => `Mon 2026-11-${String(i).padStart(3, '0')} | 08:00 | 16:30`)
    const shown = maxDayRows === undefined ? rows : rows.slice(0, maxDayRows)
    return [...shown, `TOTAL (${maxDayRows ?? 'all'})`].join('\n')
  }

  it('keeps the full text when it fits', () => {
    expect(body(fittingMailtoUrl('S', () => 'short'))).toBe('short')
  })

  it('drops day rows until the URL fits, keeping the total', () => {
    const url = fittingMailtoUrl('Working times', longText)
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH)
    expect(body(url)).toMatch(/TOTAL \(\d+\)$/)
    expect(body(url).split('\n').length).toBeGreaterThan(20)
  })

  it('encodes subject and body', () => {
    expect(fittingMailtoUrl('A & B', () => 'line 1\nline 2')).toBe('mailto:?subject=A%20%26%20B&body=line%201%0Aline%202')
  })
})

describe('downloadFile', () => {
  it('clicks a temporary download link for the CSV', () => {
    const clicks: Array<{ href: string; download: string }> = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, download: this.download }) }
    URL.createObjectURL = vi.fn(() => 'blob:clocked/1')
    URL.revokeObjectURL = vi.fn()
    try {
      downloadFile(csvFile('clocked_2026-11-09_2026-11-15.csv', 'a;b'))
    } finally {
      HTMLAnchorElement.prototype.click = orig
    }
    expect(clicks).toEqual([{ href: 'blob:clocked/1', download: 'clocked_2026-11-09_2026-11-15.csv' }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
