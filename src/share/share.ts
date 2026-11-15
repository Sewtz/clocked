/**
 * Hand an export to the user's mail app. Fully local: no network involved.
 *
 * 1. Web Share with a file (Android/iOS, secure context): opens the system share sheet
 *    with the CSV attached plus subject and body text — the user picks Mail or any app.
 * 2. Fallback (most desktop browsers, plain-HTTP LAN): open a mailto: draft whose body
 *    holds the table. No file is created; mailto can't carry attachments.
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
  /**
   * Mail body for the mailto: draft (no attachment). Called with a row limit when the
   * full text would make the URL too long.
   */
  draftText: (maxDayRows?: number) => string
}

export type ShareResult = 'shared' | 'cancelled' | 'draft'

export interface ShareEnv {
  navigator: Partial<Pick<Navigator, 'share' | 'canShare'>>
  /** Open a URL such as mailto: (fallback). */
  openUrl(url: string): void
}

/**
 * Upper bound for the mailto: URL. Current browsers and mail apps accept far longer URLs;
 * the old ~2000-character limit came from Internet Explorer. Longer texts drop day rows.
 */
export const MAILTO_MAX_LENGTH = 8000

const buildMailto = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

/** The longest draft that fits: full text first, then fewer day rows. */
export function fittingMailtoUrl(subject: string, draftText: SharePayload['draftText'], max = MAILTO_MAX_LENGTH): string {
  let url = buildMailto(subject, draftText())
  for (let rows = 60; url.length > max && rows >= 0; rows = rows > 10 ? rows - 10 : rows - 1) {
    url = buildMailto(subject, draftText(rows))
  }
  return url
}

/** Save the CSV as a file (separate "Download CSV" action; not part of the share fallback). */
export function downloadFile(file: File, doc: Document = document): void {
  const url = URL.createObjectURL(file)
  const a = doc.createElement('a')
  a.href = url
  a.download = file.name
  a.style.display = 'none'
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function csvFile(fileName: string, csv: string): File {
  return new File([csv], fileName, { type: 'text/csv' })
}

export function browserShareEnv(): ShareEnv {
  return {
    navigator: typeof navigator === 'undefined' ? {} : navigator,
    openUrl(url) {
      // A link click hands mailto: to the OS mail handler without leaving the app.
      const a = document.createElement('a')
      a.href = url
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  }
}

export async function shareExport(p: SharePayload, env: ShareEnv = browserShareEnv()): Promise<ShareResult> {
  const nav = env.navigator
  if (nav.share && nav.canShare) {
    const file = csvFile(p.fileName, p.csv)
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: p.subject, text: p.text })
        return 'shared'
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
        // e.g. NotAllowedError when the user activation was lost: fall back below.
      }
    }
  }
  env.openUrl(fittingMailtoUrl(p.subject, p.draftText))
  return 'draft'
}
