# rule.require.wait-for-target-element

## .what

wait for the specific element you will interact with, not a generic ancestor.

## .why

generic waits miss specific state:
- container may exist, button may not
- list may render, target item may not
- form may show, required field may not

specific waits ensure actionable state.

## .pattern

```typescript
// 🚫 generic: page loaded but button may not exist
await page.waitForSelector('#page');
await page.click('#submit');  // may fail

// ✓ specific: wait for actual target
await page.waitForSelector('#submit', { state: 'visible' });
await page.click('#submit');  // guaranteed to exist
```

## .wait states

| state | use when |
|-------|----------|
| `attached` | element in dom (may be hidden) |
| `visible` | element visible on screen |
| `enabled` | element can be interacted with |
| `editable` | input can receive text |

## .examples

### button click

```typescript
// wait for button to be visible and enabled
const button = page.locator('#submit');
await expect(button).toBeVisible();
await expect(button).toBeEnabled();
await button.click();
```

### form input

```typescript
// wait for input to be editable
const input = page.locator('#email');
await expect(input).toBeVisible();
await expect(input).toBeEditable();
await input.fill('test@example.com');
```

### list item

```typescript
// wait for specific item in list
const item = page.locator('.user-list .user-item').filter({ hasText: 'Alice' });
await expect(item).toBeVisible();
await item.click();
```

### dropdown option

```typescript
// wait for dropdown to be interactive
const select = page.locator('#country');
await expect(select).toBeVisible();
await expect(select).toBeEnabled();
await select.selectOption('US');
```

## .dynamic content

```typescript
// element appears after api response
await page.waitForSelector(`[data-user-id="${userId}"]`, { timeout: 10000 });
await page.click(`[data-user-id="${userId}"]`);

// element appears after animation
await page.waitForSelector('#modal', { state: 'visible' });
await page.click('#modal .confirm');
```

## .conditional elements

```typescript
// element may or may not appear
const confirmDialog = page.locator('#confirm-dialog');
const isVisible = await confirmDialog.isVisible();
if (isVisible) {
  await confirmDialog.locator('#confirm-yes').click();
}
```

## .antipatterns

```typescript
// 🚫 wait for wrong element
await page.waitForSelector('#form');  // form exists
await page.click('#form #submit');  // submit may not exist yet

// 🚫 fixed delay
await page.waitForTimeout(1000);  // arbitrary delay
await page.click('#submit');  // may still fail

// 🚫 no wait at all
await page.click('#submit');  // race condition
```

## .enforcement

action on element without specific wait = blocker

## .see also

- `rule.require.wait-for-content-not-shell.md` — content vs shell
- `verification/rule.require.action-verification.md` — verify after action
