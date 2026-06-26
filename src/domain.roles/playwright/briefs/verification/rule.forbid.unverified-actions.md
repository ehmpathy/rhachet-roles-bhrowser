# rule.forbid.unverified-actions

## .what

every browser action must be verified. never fire-and-forget.

## .why

browsers are async and stateful:
- clicks may not register
- navigations may fail silently
- forms may not submit
- pages may load partial content

unverified actions create false confidence.

## .pattern

```typescript
// every action has verification
await page.click('#submit');
await page.waitForURL('**/success');  // verify navigation happened

await page.fill('#email', email);
expect(await page.inputValue('#email')).toBe(email);  // verify value set

await page.selectOption('#country', 'US');
expect(await page.locator('#country').inputValue()).toBe('US');  // verify selection
```

## .antipattern

```typescript
// 🚫 fire-and-forget
await page.click('#submit');
// hope it worked...

await page.fill('#email', email);
// assume it filled...

await page.goto('https://example.com');
// assume it loaded...
```

## .verification by action type

| action | verification |
|--------|--------------|
| click | waitForURL, waitForSelector, state change |
| fill | inputValue check |
| selectOption | inputValue check |
| goto | waitForURL, waitForLoadState |
| check | isChecked |
| type | inputValue check |

## .examples

### navigation click

```typescript
// click opens new page
await page.click('a[href="/dashboard"]');
await page.waitForURL('**/dashboard');
expect(page.url()).toContain('/dashboard');
```

### form fill

```typescript
// fill and verify
await page.fill('#name', 'Alice');
await page.fill('#email', 'alice@example.com');

// verify both fields
expect(await page.inputValue('#name')).toBe('Alice');
expect(await page.inputValue('#email')).toBe('alice@example.com');
```

### submit form

```typescript
// submit and verify result
await page.click('#submit');
await page.waitForSelector('.success-message');
expect(await page.textContent('.success-message')).toContain('saved');
```

## .enforcement

browser action without verification = blocker

## .see also

- `rule.require.action-verification.md` — verification patterns
- `spa/rule.require.wait-for-content-not-shell.md` — spa verification
