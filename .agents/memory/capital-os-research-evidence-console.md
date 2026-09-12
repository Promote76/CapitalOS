---
name: Research evidence console state
description: Keep the collapsible Advanced Evidence Console synchronized while evidence queries refresh.
---

The Advanced Evidence Console should use the disclosure element's native open state; do not manually prevent the summary's native toggle or control it from React state.

**Why:** Evidence and dossier refetches rerender the console, and a manually intercepted or React-controlled summary click can leave the native `open` attribute and component state out of sync, hiding selected evidence during a refresh.

**How to apply:** Keep the stable console test id on the outer disclosure, open it explicitly before legacy evidence assertions, and use stable evidence input test ids when certifying long-page interactions.