---
name: Budget hash navigation
description: Reliable same-route anchor navigation for the Budget planning control center.
---

Wouter navigation can update a same-route URL hash through history without emitting the browser `hashchange` event. Budget links that target an in-page planning section must explicitly schedule the scroll after router navigation and also retain the mount-time hash scroll for direct loads.

**Why:** A link can visibly change the URL to `/budget#budget-planning` while leaving the user at the previous scroll position, making the plan builder appear not to work.

**How to apply:** When changing the Budget planning anchor or router behavior, verify same-page clicks, direct hash loads, and desktop/mobile viewport positions. Keep modified-click behavior native so Ctrl/Cmd-click can still open a new tab.