# Clocked

Clocked is a small, installable Progressive Web App (PWA) for logging your work
start/stop times and tracking the accumulated worked time for the day — fully
offline, on your own device.

A live, installable build is published at the GitHub Pages site:

> **https://sewtz.github.io/clocked/**

No account, no backend, no network required. After the first install it runs in
airplane mode, and your entries stay in persistent on-device storage.

## What it is for

Clocked mirrors a manual clock-in at a workplace terminal: when you clock in at
work, you open Clocked on your phone and record the same start time locally.
From that point the app shows how long you have been on the clock — accounting
for mandatory breaks — until the day resets at midnight.

You can clock out for personal errands and back in; the app keeps your worked
time across all sessions of the day.

## How it works

- **Clock in** with a single button. Worked time is accumulated across every
  session of the day — clock out and back in as often as you need.
- **Live elapsed display** in `HH:MM`, computed from stored punch timestamps so
  the timer stays correct across screen lock and app restarts (it does not tick
  while hidden).
- **Stats grid** shows Worked, Breaks, and Remaining (or Overtime once you pass
  the daily target).
- **Daily target bar** shows progress toward your configurable target, with the
  0h / half / full markers. The bar turns overtime-colored past 100%.
- **Two automatic breaks** are applied based on accumulated worked time. Each
  break has its own trigger threshold and duration, and can be toggled on or off
  in settings. While a break is running, a *Mandatory break (NN min)* banner
  with a progress bar and a `MM:SS` countdown is shown, and work resumes
  automatically when the break ends.
- **Next-milestone hint** shows the upcoming auto-break and how far away it is.
- **Timeline** visualizes the day as colored segments (Work / Brk / Gap) with
  their start→end times and durations. Tap it to open the **Edit times** dialog,
  where you can correct any punch in/out time directly — useful if you forgot to
  clock in right away.
- **Daily reset at midnight** — yesterday's entry is discarded, the clock-in
  button comes back.
- **Fully local** — every entry lives in IndexedDB on your device. The app makes
  no network calls at runtime and works in airplane mode after first install.
- **Configurable daily target and automatic breaks** are editable in Settings.

### Why "fully local"?

There is no account, no server, no sync. Your work-time data never leaves your
phone. The service worker caches the app shell so the app keeps working
offline, and `navigator.storage.persist()` is requested on first interaction so
the browser does not evict your data under storage pressure.

## Installing on your phone

Clocked is a PWA — you install it from the browser with *Add to Home Screen*.
No app store is needed.

### Android (Chrome)

1. Open **https://sewtz.github.io/clocked/** in Chrome.
2. Tap the menu (︽) → **Add to Home screen** (or **Install app**).
3. Confirm. The Clocked icon appears on your home screen.
4. Launch it from the home screen — it runs full-screen, offline, and
   independent of the browser.

### iOS (Safari)

1. Open **https://sewtz.github.io/clocked/** in Safari.
2. Tap the **Share** button (􀄴) at the bottom of the screen.
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add**. The Clocked icon appears on your home screen.
5. Launch it from the home screen — it runs full-screen and offline. Note that
   iOS PWAs have limited background execution, but Clocked recomputes elapsed
   time from stored timestamps when you reopen it, so a running timer survives
   screen lock correctly.

## Disclaimer

This project was built with the help of AI tools (large language models) for
code generation, documentation, and review. The generated output was reviewed
and adapted by the author, but please be aware that bugs or mistakes may be
present. Use it at your own risk.
