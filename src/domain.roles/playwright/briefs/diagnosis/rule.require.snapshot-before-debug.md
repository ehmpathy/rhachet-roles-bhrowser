# rule.require.snapshot-before-debug

## .what

before you debug any browser issue, capture a full snapshot.

## .why

debug without evidence is a guess:
- symptoms change between observations
- state mutates while you investigate
- memory of what you saw is unreliable

a snapshot freezes state for analysis.

## .pattern

```bash
# action failed
browser.action --session $SESSION --play failed-action.play.ts
# error: could not find element

# FIRST: capture state
browser.snapshot --session $SESSION --focused

# NOW: analyze frozen state
# - screenshot: what user sees
# - html: what dom contains
# - console: error messages
# - network: failed requests
```

## .what snapshots capture

| artifact | reveals |
|----------|---------|
| screenshot | visual state, overlays, modals |
| html | dom structure, hidden elements |
| console | js errors, warnings, logs |
| network | failed requests, awaited loads |
| storage | cookies, localStorage state |
| meta | url, title, tab info |

## .diagnosis workflow

```
error occurs
    │
    └─> snapshot immediately
          │
          ├─> check screenshot
          │   └─ visible state matches expectation?
          │
          ├─> check html
          │   └─ element exists in dom?
          │
          ├─> check console
          │   └─ js errors that prevent render?
          │
          └─> check network
              └─ request failed or awaited?
```

## .antipattern

```bash
# 🚫 debug without snapshot
# "let me check if the element exists..."
browser.action --session $SESSION --play check-element.play.ts
# "hmm, now it says different error..."
# state has changed, you chase ghosts
```

## .enforcement

debug browser issue without prior snapshot = blocker

## .see also

- `rule.require.snapshot-before-assume.md` — snapshot before assume
- `howto.browser-diagnosis.md` — full diagnosis workflow
