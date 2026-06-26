# rule.require.snapshot-latest-tab

## .what

when you diagnose issues, snapshot the latest (most recently opened) tab first.

## .why

- navigation often opens new tabs
- popups and oauth flows spawn tabs
- the action that failed likely happened in the newest tab
- `--focused` gets the human-focused tab, but automation may be in another

## .pattern

```bash
# first: see all tabs
browser.describe --session $SESSION
# output shows: tab 0 (original), tab 1 (oauth popup), tab 2 (result)

# snapshot latest tab (highest index)
browser.snapshot --session $SESSION --tab 2 --url 'expected-url.com'

# if that's not the issue, work backwards
browser.snapshot --session $SESSION --tab 1 --url 'oauth-provider.com'
```

## .tab order

| index | typical content |
|-------|-----------------|
| 0 | original/start page |
| 1 | first popup/redirect |
| -1 | most recent (alias for highest) |

## .common scenarios

### oauth flow

```
user clicks "login with google"
  │
  ├─ tab 0: original site (awaited)
  └─ tab 1: google oauth (active)
       │
       └─ tab 2: callback page (final result)
```

snapshot tab 2 first — that's where the result is.

### file download

```
user clicks "download"
  │
  ├─ tab 0: original page
  └─ tab 1: download initiated (may close)
```

### popup blocked

```
action opens popup
  │
  └─ tab 0: popup blocked notification
       (no new tab created)
```

## .antipattern

```bash
# 🚫 always snapshot tab 0
browser.snapshot --session $SESSION --tab 0
# shows original page, but error is in popup tab
```

## .enforcement

diagnose navigation issue without check of latest tab = blocker

## .see also

- `browser.describe.sh` — list all tabs
- `rule.require.snapshot-before-debug.md` — snapshot first
