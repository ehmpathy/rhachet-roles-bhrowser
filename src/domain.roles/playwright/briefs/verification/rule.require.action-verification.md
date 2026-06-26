# rule.require.action-verification

## .what

every browser action requires explicit verification that it succeeded.

## .why

browsers fail silently:
- element may be detached before click fires
- input may be cleared by framework
- navigation may redirect elsewhere
- state may not update synchronously

verification catches failures at the point of action.

## .verification patterns

### click verification

```typescript
// click that causes navigation
await page.click('#login-button');
await page.waitForURL('**/dashboard');

// click that shows element
await page.click('#expand-menu');
await page.waitForSelector('#menu-items', { state: 'visible' });

// click that changes state
await page.click('#toggle');
await expect(page.locator('#toggle')).toHaveAttribute('aria-checked', 'true');
```

### input verification

```typescript
// fill and verify
await page.fill('#email', 'test@example.com');
await expect(page.locator('#email')).toHaveValue('test@example.com');

// clear and verify
await page.fill('#search', '');
await expect(page.locator('#search')).toHaveValue('');

// type and verify
await page.type('#code', '123456');
await expect(page.locator('#code')).toHaveValue('123456');
```

### navigation verification

```typescript
// goto with full load
await page.goto('https://example.com');
await page.waitForLoadState('networkidle');

// verify correct page
expect(page.url()).toBe('https://example.com/');
await expect(page.locator('h1')).toContainText('Welcome');
```

### selection verification

```typescript
// select option
await page.selectOption('#country', 'US');
await expect(page.locator('#country')).toHaveValue('US');

// checkbox
await page.check('#terms');
await expect(page.locator('#terms')).toBeChecked();
```

## .wait strategies

| strategy | use when |
|----------|----------|
| `waitForURL` | action causes navigation |
| `waitForSelector` | action reveals element |
| `waitForLoadState` | page needs full load |
| `expect().toHave*` | verify state change |
| `waitForResponse` | action triggers api call |

## .examples

### form submission

```typescript
export const action = async (input: { page: Page }) => {
  // fill form
  await input.page.fill('#name', 'Test User');
  await expect(input.page.locator('#name')).toHaveValue('Test User');

  await input.page.fill('#email', 'test@example.com');
  await expect(input.page.locator('#email')).toHaveValue('test@example.com');

  // submit
  await input.page.click('#submit');

  // verify success
  await input.page.waitForSelector('.toast-success');
  await expect(input.page.locator('.toast-success')).toContainText('Saved');

  return { success: true };
};
```

### multi-step flow

```typescript
export const action = async (input: { page: Page }) => {
  // step 1
  await input.page.click('#next');
  await input.page.waitForSelector('#step-2', { state: 'visible' });

  // step 2
  await input.page.fill('#details', 'test');
  await expect(input.page.locator('#details')).toHaveValue('test');
  await input.page.click('#next');
  await input.page.waitForSelector('#step-3', { state: 'visible' });

  // step 3 (final)
  await input.page.click('#submit');
  await input.page.waitForURL('**/confirmation');

  return { url: input.page.url() };
};
```

## .enforcement

action without explicit verification = blocker

## .see also

- `rule.forbid.unverified-actions.md` — why verification matters
- `spa/rule.require.wait-for-content-not-shell.md` — spa patterns
