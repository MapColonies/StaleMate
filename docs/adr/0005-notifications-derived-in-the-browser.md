# Notifications are derived in the browser

The API has no history (ADR 0001): it serves one Snapshot and knows nothing of what changed or who has seen what. So the UI derives Notifications itself. Each browser keeps, per Team and Viewer in localStorage, the Waiting On state it last saw, diffs every Snapshot it polls against it, and keeps the Notifications and their dismissals there too. OS notifications go through the browser's Notification API, and a tab with a Viewer picked keeps polling in the background, so the bell and the tab title stay current without refocusing.

The cost: no OS notification while every StaleMate tab is closed (what landed meanwhile shows in the bell on return), and Notifications and dismissals don't follow a Viewer to another browser or device. A Notification is never discarded except by the Viewer dismissing it: it stays, marked "no longer on you", after its PR leaves them, and changing the via-Team filter re-baselines quietly without wiping any. A browser away for longer than the gap limit still shows what changed meanwhile in the bell, but raises no OS notifications for it, rather than replaying a vacation's worth as popups. Only a first visit starts from a baseline with none.

## Considered Options

- **Server-side Notifications with Web Push**: rejected. It needs a service worker, a push service, stored subscriptions and outbound access from the VPN-only cluster, plus per-Viewer state on a server that has no database and no idea who a Viewer is.
