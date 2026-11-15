/**
 * Hand an export to the user's mail app. Fully local: no network involved.
 *
 * 1. Web Share with a file (Android/iOS, secure context): opens the system share sheet
 *    with the CSV attached plus subject and body text — the user picks Mail or any app.
 * 2. Fallback (most desktop browsers, plain-HTTP LAN): download the CSV and open a
 *    mailto: draft with the text body (mailto can't carry attachments).
 *
 * share() must run inside the click's user activation (iOS is strict), so callers prepare
 * the payload beforehand and call this directly from the click handler; the share call
 * happens before the first await here.
 */
export interface SharePayload {
  fileName: string
  csv: string
  subject: string
  /** Mail body when the CSV is attached (share sheet). */
  text: string
  /** Mail body for the fallback, where the user attaches the downloaded file. */
  fallbackText: string
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded'

export interface ShareEnv {
  navigator: Pick<Navigator, 'share' | 'canShare'> | Partial<Pick<Navigator, 'share' | 'canShare'>>
  /** Save a file locally (fallback). */
  download(file: File): void
  /** Open a URL such as mailto: (fallback). */
  openUrl(url: string): void
}

/** Keep mailto URLs short enough for mail clients and OS URL handlers. */
export const MAILTO_MAX_LENGTH = 1800

export function mailtoUrl(subject: string, body: string, max = MAILTO_MAX_LENGTH): string {
  const build = (b: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`
  let url = build(body)
  if (url.length <= max) return url
  const note = '\n…\n(shortened — the full list is in the CSV file)'
  const lines = body.split('\n')
  while (lines.length > 1) {
    lines.pop()
    url = build(lines.join('\n') + note)
    if (url.length <= max) return url
  }
  return build(note.trim())
}

export function browserShareEnv(): ShareEnv {
  return {
    navigator: typeof navigator === 'undefined' ? {} : navigator,
    download(file) {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
    openUrl(url) {
      window.location.href = url
    },
  }
}

export async function shareExport(p: SharePayload, env: ShareEnv = browserShareEnv()): Promise<ShareResult> {
  const file = new File([p.csv], p.fileName, { type: 'text/csv' })
  const nav = env.navigator
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: p.subject, text: p.text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // e.g. NotAllowedError when the user activation was lost: fall back below.
    }
  }
  env.download(file)
  env.openUrl(mailtoUrl(p.subject, p.fallbackText))
  return 'downloaded'
}
