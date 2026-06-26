# rule.require.spa-navigation-fail-fast

## .what

spa navigations must fail fast when target content is absent. do not retry indefinitely.

## .why

spas often show stale content:
- cached components render
- previous route data persists
- skeleton screens display indefinitely
- error states are swallowed

fail-fast detects these states early.

## .pattern

```typescript
// navigate and verify target exists quickly
await page.goto('https://spa.example.com/dashboard');
await page.waitForSelector('#dashboard-content', { timeout: 10000 });

// if absent after 10s, fail immediately
// do not retry for 60s hopin it appears
```

## .antipattern

```typescript
// 🚫 long timeout hides problems
await page.waitForSelector('#dashboard-content', { timeout: 120000 });
// 2 minutes later: "hmm, still not there"
// reality: route was wrong, content never existed
```

## .fail-fast strategy

| phase | timeout | action on failure |
|-------|---------|-------------------|
| initial load | 10s | fail, check url |
| content render | 10s | fail, check selector |
| api settle | 30s | fail, check network |

## .examples

### fast navigation check

```typescript
import { BadRequestError } from 'helpful-errors';

export const action = async (input: { page: Page }) => {
  await input.page.goto('https://app.example.com/users');

  // fast check: are we on the right route?
  const url = input.page.url();
  if (!url.includes('/users')) {
    throw new BadRequestError(`wrong route: ${url}`, {
      hint: 'check if navigation was redirected',
    });
  }

  // fast check: does content exist?
  const content = await input.page.$('#user-list');
  if (!content) {
    throw new BadRequestError('user list not found', {
      hint: 'check if route requires auth',
    });
  }

  // now safe to wait for full render
  await input.page.waitForSelector('#user-list .user-row', { timeout: 10000 });
};
```

### progressive verification

```typescript
export const action = async (input: { page: Page }) => {
  await input.page.goto('https://app.example.com/report');

  // phase 1: shell loaded (fast)
  await input.page.waitForSelector('#report-container', { timeout: 5000 });

  // phase 2: content renders (medium)
  await input.page.waitForSelector('#report-data', { timeout: 10000 });

  // phase 3: data loads (slow, but bounded)
  await input.page.waitForSelector('#report-data:not(:empty)', { timeout: 30000 });
};
```

## .detection patterns

| symptom | likely cause |
|---------|--------------|
| shell renders, no content | auth required |
| wrong route | redirect happened |
| empty data container | api failed silently |
| stale content | cache served |

## .enforcement

spa navigation without early fail-fast check = blocker

## .see also

- `rule.require.wait-for-content-not-shell.md` — wait for real content
- `reliability/rule.require.bounded-timeouts-and-bisection.md` — timeout bounds
