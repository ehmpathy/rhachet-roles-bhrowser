# howto.browser-diagnosis

## .what

systematic approach to diagnose browser automation issues.

## .workflow

```
1. snapshot
   └─> freeze state before it changes

2. observe
   ├─> screenshot: what's visible?
   ├─> html: what's in dom?
   ├─> console: any errors?
   └─> network: requests failed?

3. hypothesize
   └─> form theory based on evidence

4. test
   └─> minimal action to test theory

5. iterate
   └─> new snapshot, new observation
```

## .step 1: snapshot

```bash
# capture all artifacts
browser.snapshot --session $SESSION --focused

# output location
.cache/browser.$SESSION/snapshot.$TIMESTAMP/
├── snapshot.meta.json
├── snapshot.png
├── snapshot.html
├── snapshot.storage.json
├── snapshot.console.json
└── snapshot.network.json
```

## .step 2: observe

### screenshot analysis

```bash
# view screenshot
open .cache/browser.$SESSION/snapshot.*/snapshot.png

# check:
# - is the expected page visible?
# - any overlays that block content?
# - load indicators present?
# - error messages displayed?
```

### html analysis

```bash
# search for element
grep -i "submit" snapshot.html

# check element visibility
grep -B5 -A5 "submit" snapshot.html
# look for: style="display:none", class="hidden", etc.
```

### console analysis

```bash
# check for errors
cat snapshot.console.json | jq '.[] | select(.type == "error")'

# common issues:
# - uncaught TypeError (JS error)
# - CORS errors (blocked requests)
# - 404 (absent resources)
```

### network analysis

```bash
# check for failed requests
cat snapshot.network.json | jq '.[] | select(.status >= 400)'

# check for awaited requests
cat snapshot.network.json | jq '.[] | select(.status == null)'
```

## .step 3: common diagnoses

| symptom | likely cause | verification |
|---------|--------------|--------------|
| element not found | not in dom | grep html |
| element not visible | CSS hidden | grep for display/visibility |
| timeout | still loads | check network awaited |
| wrong page | navigation issue | check screenshot url |
| stale element | dom changed | re-snapshot |
| click blocked | overlay present | screenshot shows modal |

## .step 4: targeted action

```bash
# test hypothesis with minimal playbook
browser.action --session $SESSION --play test-hypothesis.play.ts
```

```typescript
// test-hypothesis.play.ts
/**
 * .what = test hypothesis about element visibility
 * .why = validates theory with minimal action before complex fix
 */
export const action = async (
  input: Record<string, never>,
  context: { page: Page; log: LogMethods },
) => {
  // check element state
  const element = await context.page.$('#my-element');
  context.log.info('element exists:', { exists: !!element });
  context.log.info('element visible:', { visible: await element?.isVisible() });
};
```

## .step 5: iterate

```bash
# new snapshot after action
browser.snapshot --session $SESSION --focused

# compare to previous
diff snapshot.before.html snapshot.after.html
```

## .diagnosis checklist

- [ ] snapshot captured before debug?
- [ ] screenshot reviewed?
- [ ] html searched for target element?
- [ ] console checked for errors?
- [ ] network checked for failures?
- [ ] hypothesis formed from evidence?
- [ ] minimal test action executed?

## .see also

- `rule.require.snapshot-before-debug.md` — always snapshot first
- `rule.require.grep-html-before-selector-guess.md` — search before select
- `howto.debug-movie-frames.md` — capture action sequences
