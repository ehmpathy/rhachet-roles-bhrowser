# rule.forbid.test-goto

## .what

do not use `page.goto()` directly in tests. use playbooks instead.

## .why

direct goto in tests:
- duplicates navigation logic
- lacks verification
- is not reusable
- bypasses error capture

playbooks:
- are version controlled
- include verification
- are reusable
- capture errors properly

## .pattern

```typescript
// 🚫 direct goto in test
it('loads dashboard', async () => {
  await page.goto('https://example.com/dashboard');
  await page.waitForSelector('#content');
  // navigation logic in test
});

// ✓ playbook in test
it('loads dashboard', async () => {
  const result = await rhxFull(`rhx browser.action --session ${session} --play ./goto-dashboard.play.ts`);
  expect(result.exitCode).toBe(0);
});
```

## .why playbooks

| concern | direct goto | playbook |
|---------|-------------|----------|
| reuse | copy-paste | import |
| verification | manual | built-in |
| error capture | none | automatic |
| version control | scattered | centralized |
| code review | in test file | separate PR |

## .exceptions

### test setup

```typescript
// setup-only navigation is acceptable
beforeAll(async () => {
  await page.goto('about:blank');  // reset state
});
```

### navigation verification tests

```typescript
// test that verifies goto behavior itself
it('handles redirect', async () => {
  await page.goto('https://example.com/old-path');
  // this IS the behavior under test
  expect(page.url()).toContain('/new-path');
});
```

## .enforcement

`page.goto()` in test body (outside of setup/teardown) = blocker

## .see also

- `skills/howto.browser-action-playbooks.md` — playbook format
- `howto.test-via-browser.md` — test patterns
