# rule.require.fast-tests

## .what

browser tests must be fast. optimize for feedback speed.

## .why

slow tests:
- block ci pipelines
- reduce iteration speed
- discourage test runs
- waste compute resources

fast tests enable:
- rapid feedback
- frequent runs
- developer confidence
- lower costs

## .guidelines

| scope | target | max |
|-------|--------|-----|
| unit test | < 100ms | 500ms |
| integration test | < 5s | 30s |
| acceptance test | < 30s | 2min |
| full suite | < 5min | 15min |

## .optimization patterns

### share browser across tests

```typescript
// ✓ one browser for suite
beforeAll(() => {
  rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
});

afterAll(() => {
  stopBrowser(session);
});

// 🚫 new browser per test
beforeEach(() => {
  rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
});
```

### minimize navigation

```typescript
// ✓ navigate once, test multiple aspects
given('[case1] on dashboard', () => {
  const scene = useBeforeAll(() => {
    rhx(`rhx browser.action --session ${session} --play ./goto-dashboard.play.ts`);
    return rhxFull(`rhx browser.snapshot --session ${session} --focused`);
  });

  then('header shows user name', () => { /* ... */ });
  then('sidebar shows menu', () => { /* ... */ });
  then('content area loads', () => { /* ... */ });
});

// 🚫 navigate per assertion
then('header shows user name', () => {
  rhx(`rhx browser.action --session ${session} --play ./goto-dashboard.play.ts`);
  // slow: re-navigates for each assertion
});
```

### use headless mode

```typescript
// ✓ headless for speed
rhx(`rhx browser.start --session ${session} --mode HEADLESS`);

// headful only when needed
// rhx(`rhx browser.start --session ${session} --mode HEADFUL`);
```

### parallel execution

```typescript
// ✓ independent sessions for parallel
describe.each(['a', 'b', 'c'])('test group %s', (group) => {
  const session = `test-${group}`;
  // each group runs in parallel with own browser
});
```

### bounded timeouts

```typescript
// ✓ short timeouts fail fast
await page.waitForSelector('#content', { timeout: 5000 });

// 🚫 long timeouts slow failures
await page.waitForSelector('#content', { timeout: 60000 });
```

## .measurement

```bash
# measure test time
time npm run test:integration

# identify slow tests
npx jest --reporters=default --reporters=jest-slow-test-reporter
```

## .common slow patterns

| pattern | time | fix |
|---------|------|-----|
| browser per test | +5s/test | share browser |
| navigation per assert | +2s/assert | share navigation |
| headful mode | +1s/test | use headless |
| long timeouts | +Ns/failure | bound timeouts |
| sequential tests | linear | parallelize |

## .enforcement

- test > 30s without justification = blocker
- suite > 15min without parallelization = blocker

## .see also

- `reliability/rule.require.bounded-timeouts-and-bisection.md` — timeout bounds
- `howto.test-via-browser.md` — test patterns
