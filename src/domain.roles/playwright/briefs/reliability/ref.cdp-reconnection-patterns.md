# ref.cdp-reconnection-patterns

## .what

patterns for stable cdp (chrome devtools protocol) connections.

## .why

cdp connections break due to:
- browser crash
- network timeout
- memory exhaustion
- tab close
- process termination

automation must survive disconnection and recover state.

## .connection patterns

### ws-endpoint persistence

```bash
# browser stores ws-endpoint on start
browser.start --session $SESSION --mode HEADLESS
# writes to: .cache/browser.$SESSION/ws-endpoint

# reconnect via stored endpoint
browser.describe --session $SESSION
# reads from: .cache/browser.$SESSION/ws-endpoint
```

### reconnection flow

```typescript
import { HelpfulError } from 'helpful-errors';

/**
 * .what = get browser by reconnection to stored ws-endpoint
 * .why = enables session recovery after disconnect without restart
 */
const getBrowserReconnected = async (input: { session: string }) => {
  // read stored ws-endpoint
  const wsEndpoint = await fs.readFile(
    `.cache/browser.${input.session}/ws-endpoint`,
    'utf8'
  );

  // reconnect with HelpfulError.wrap — errors propagate with enriched metadata
  const browser = await HelpfulError.wrap(
    () => chromium.connectOverCDP(wsEndpoint),
    {
      message: 'browser reconnection failed',
      metadata: { session: input.session, wsEndpoint },
      hint: 'browser may have crashed — restart with browser.start',
    },
  )();

  return browser;
};
```

## .health check patterns

### health check

```typescript
import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = get primary context from browser
 * .why = first context is main window; used for health checks
 */
const getContextPrimary = (input: { browser: Browser }) => input.browser.contexts()[0];

/**
 * .what = get browser health status
 * .why = detects crashed browsers before operations fail
 */
const getBrowserHealth = async (input: { browser: Browser }) => {
  // check browser has contexts
  const contexts = input.browser.contexts();
  if (contexts.length === 0) {
    throw new UnexpectedCodePathError('browser has no contexts', {
      hint: 'browser may have crashed; restart required',
    });
  }

  // check primary context has pages
  const contextPrimary = getContextPrimary({ browser: input.browser });
  const pages = contextPrimary.pages();
  if (pages.length === 0) {
    throw new UnexpectedCodePathError('browser has no pages', {
      hint: 'all tabs closed; open a new page or restart browser',
    });
  }

  return true;
};
```

### graceful degradation

```typescript
import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = set action to run with browser reconnection
 * .why = enables graceful recovery from disconnected sessions
 */
const setActionWithReconnect = async (
  input: { session: string },
  action: (browser: Browser) => Promise<void>
) => {
  // reconnect to session
  const browser = await getBrowserReconnected({ session: input.session });

  // execute action with reconnected browser
  await action(browser);
};
```

## .failure modes

| failure | symptom | recovery |
|---------|---------|----------|
| browser crash | connection refused | restart browser |
| tab close | page not found | re-navigate |
| memory exhaustion | browser unresponsive | restart browser |
| network timeout | connection timeout | reconnect |
| process killed | connection refused | restart browser |

## .best practices

### session isolation

```bash
# each task gets own session
browser.start --session task-001 --mode HEADLESS
browser.action --session task-001 --play task.play.ts
browser.stop --session task-001

# failure isolated to one session
```

### cleanup on error

```bash
# always stop on error
browser.action --session $SESSION --play risky.play.ts || {
  browser.stop --session $SESSION
  exit 1
}
```

### timeout bounds

```typescript
// bound all operations
const page = await browser.newPage();
page.setDefaultTimeout(30000);  // 30s default
page.setDefaultNavigationTimeout(60000);  // 60s for navigation
```

## .see also

- `browser.start.sh` — browser lifecycle
- `browser.stop.sh` — session cleanup
- `browser.describe.sh` — session inspection
