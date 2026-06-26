# rule.require.snapshot-before-assume

## .what

take a snapshot before you assume page state. never guess what the browser shows.

## .why

assumptions about page state cause:
- wrong selectors (element not visible)
- wrong time (content not loaded)
- wrong context (different page than expected)

snapshots provide evidence for decisions.

## .pattern

```bash
# before any assumption about state
browser.snapshot --session $SESSION --focused

# now you can see:
# - screenshot: what's visible
# - html: what's in dom
# - console: any errors
# - network: queued requests
```

## .antipattern

```bash
# 🚫 guess selector without view of page
browser.action --session $SESSION --play click-submit.play.ts
# fails: "element not found"
# you: "but it should be there!"
# reality: page shows login form, not submit button
```

## .examples

### good: snapshot first

```bash
# see what's actually on page
browser.snapshot --session $SESSION --focused
# output: screenshot shows load spinner

# now you know: wait for content
browser.action --session $SESSION --play wait-for-content.play.ts
```

### bad: assume then debug

```bash
# assume page is ready
browser.action --session $SESSION --play submit-form.play.ts
# error: timeout awaited for #submit-button

# now you snapshot to debug
browser.snapshot --session $SESSION --focused
# output: page shows captcha challenge

# wasted time on wrong assumption
```

## .enforcement

assumed page state without prior snapshot = blocker

## .see also

- `rule.require.snapshot-before-debug.md` — snapshot before debug
- `rule.require.grep-html-before-selector-guess.md` — search before select
