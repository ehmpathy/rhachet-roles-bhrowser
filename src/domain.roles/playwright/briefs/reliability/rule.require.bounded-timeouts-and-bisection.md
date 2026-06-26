# rule.require.bounded-timeouts-and-bisection

## .what

every browser operation must have a bounded timeout. long timeouts must be bisected to narrow failure point.

## .why

unbounded waits cause:
- test suite hangs
- resource exhaustion
- unclear failure cause
- wasted debug time

bisection enables:
- narrow failure window
- identify slow operation
- set appropriate bounds

## .pattern

### bound all timeouts

```typescript
// explicit timeout on every wait
await page.waitForSelector('#content', { timeout: 5000 });
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForLoadState('networkidle', { timeout: 30000 });

// page-level defaults
page.setDefaultTimeout(30000);  // 30s for actions
page.setDefaultNavigationTimeout(60000);  // 60s for navigation
```

### bisect long operations

```typescript
// 🚫 long undifferentiated timeout
await page.goto('https://slow-site.com', { timeout: 120000 });

// ✓ bisected timeouts identify bottleneck
await page.goto('https://slow-site.com', { timeout: 30000 });  // initial load
await page.waitForLoadState('domcontentloaded', { timeout: 10000 });  // dom ready
await page.waitForLoadState('networkidle', { timeout: 60000 });  // api calls settle
await page.waitForSelector('#main-content', { timeout: 10000 });  // target visible
```

## .timeout guidelines

| operation | typical bound | max bound |
|-----------|---------------|-----------|
| click | 5s | 10s |
| fill | 3s | 5s |
| waitForSelector | 10s | 30s |
| waitForURL | 10s | 30s |
| goto | 30s | 60s |
| networkidle | 30s | 60s |

## .bisection workflow

when operation times out:

```
total timeout: 60s
  │
  ├─> bisect into 4 phases
  │   ├─ goto (15s)
  │   ├─ domcontentloaded (15s)
  │   ├─ networkidle (15s)
  │   └─ target element (15s)
  │
  └─> which phase failed?
      └─ narrow timeout, investigate that phase
```

## .examples

### timestamp transformers

```typescript
/**
 * .what = get current timestamp in milliseconds
 * .why = isolates Date.now() call from orchestrator
 */
const asTimestamp = (): number => Date.now();

/**
 * .what = compute duration since a start timestamp
 * .why = isolates arithmetic from orchestrator
 */
const asDuration = (input: { since: number }): number =>
  Date.now() - input.since;

/**
 * .what = log phase completion with duration
 * .why = encapsulates phase time pattern for reuse
 */
const logPhaseComplete = (
  input: { phase: string; since: number },
  context: { log: LogMethods },
): void => {
  context.log.debug('phase complete', {
    phase: input.phase,
    ms: asDuration({ since: input.since }),
  });
};
```

### page load bisection

```typescript
/**
 * .what = load page with bisected duration for each phase
 * .why = identifies which phase causes timeouts
 */
export const action = async (
  input: { url: string },
  context: { page: Page; log: LogMethods },
) => {
  // phase 1: initial navigation
  const startGoto = asTimestamp();
  await context.page.goto(input.url, { timeout: 30000 });
  logPhaseComplete({ phase: 'goto', since: startGoto }, context);

  // phase 2: dom ready
  const startDom = asTimestamp();
  await context.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  logPhaseComplete({ phase: 'dom', since: startDom }, context);

  // phase 3: network settles
  const startNetwork = asTimestamp();
  await context.page.waitForLoadState('networkidle', { timeout: 30000 });
  logPhaseComplete({ phase: 'network', since: startNetwork }, context);

  // phase 4: target appears
  const startTarget = asTimestamp();
  await context.page.waitForSelector('#dashboard', { timeout: 10000 });
  logPhaseComplete({ phase: 'target', since: startTarget }, context);

  return { url: context.page.url() };
};
```

### action bisection

```typescript
/**
 * .what = submit form with bisected duration for each step
 * .why = identifies which form step causes timeouts
 */
export const action = async (
  input: { email: string; password: string },
  context: { page: Page; log: LogMethods },
) => {
  // bisect form submission
  const startEmail = asTimestamp();
  await context.page.fill('#email', input.email, { timeout: 5000 });
  logPhaseComplete({ phase: 'fill-email', since: startEmail }, context);

  const startPassword = asTimestamp();
  await context.page.fill('#password', input.password, { timeout: 5000 });
  logPhaseComplete({ phase: 'fill-password', since: startPassword }, context);

  const startSubmit = asTimestamp();
  await context.page.click('#submit', { timeout: 5000 });
  logPhaseComplete({ phase: 'click-submit', since: startSubmit }, context);

  const startRedirect = asTimestamp();
  await context.page.waitForURL('**/dashboard', { timeout: 10000 });
  logPhaseComplete({ phase: 'wait-redirect', since: startRedirect }, context);

  return { success: true };
};
```

## .enforcement

- unbounded timeout = blocker
- timeout > 60s without bisection = blocker

## .see also

- `test/rule.require.fast-tests.md` — test performance
- `spa/rule.require.wait-for-content-not-shell.md` — spa waits
