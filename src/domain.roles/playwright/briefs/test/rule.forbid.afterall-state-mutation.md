# rule.forbid.afterall-state-mutation

## .what

afterAll must only cleanup; never mutate test state.

## .why

afterAll runs after all tests complete. state mutations:
- affect already-run tests (too late)
- create order dependencies
- cause flaky tests
- hide failures

afterAll is for cleanup only.

## .pattern

```typescript
// ✓ afterAll for cleanup
afterAll(() => {
  stopBrowser(session);  // cleanup resource
});

// 🚫 afterAll mutates state
afterAll(async () => {
  await page.goto('https://example.com/cleanup');  // too late
  await db.deleteTestData();  // affects next run, not this one
});
```

## .valid afterAll uses

| action | allowed | reason |
|--------|---------|--------|
| stop browser | yes | resource cleanup |
| close connection | yes | resource cleanup |
| delete temp files | yes | cleanup |
| log summary | yes | observability |

## .invalid afterAll uses

| action | forbidden | reason |
|--------|-----------|--------|
| navigate page | yes | tests done |
| modify database | yes | affects next run |
| assert state | yes | too late |
| set variables | yes | no effect |

## .examples

### good: cleanup

```typescript
afterAll(() => {
  stopBrowser(session);
});

afterAll(async () => {
  await db.close();
});

afterAll(() => {
  console.log('tests complete');
});
```

### bad: mutation

```typescript
// 🚫 navigation in afterAll
afterAll(async () => {
  await page.goto('https://example.com/logout');
  // tests already ran, this has no effect
});

// 🚫 data mutation in afterAll
afterAll(async () => {
  await db.query('DELETE FROM test_users');
  // affects next test run, not current
});

// 🚫 assertion in afterAll
afterAll(() => {
  expect(globalState).toBe('clean');
  // too late to fail the suite
});
```

## .where to put mutations

| purpose | where | hook |
|---------|-------|------|
| per-test setup | beforeEach | yes |
| per-test teardown | afterEach | yes |
| suite setup | beforeAll | yes |
| suite cleanup | afterAll | cleanup only |

## .enforcement

state mutation in afterAll = blocker

## .see also

- `howto.test-via-browser.md` — test structure
- `rule.require.fast-tests.md` — test performance
