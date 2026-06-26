# rule.require.wait-for-content-not-shell

## .what

wait for actual content, not app shell or skeleton screens.

## .why

spas render in phases:
1. html shell (instant)
2. js bundle loads
3. App shell renders
4. Data fetches
5. Content renders

wait for phase 5, not phase 3.

## .pattern

```typescript
// 🚫 waits for shell (may be empty)
await page.waitForSelector('#app');

// ✓ waits for actual content
await page.waitForSelector('#user-list .user-row');
await page.waitForSelector('table tbody tr');
await page.waitForSelector('#dashboard [data-loaded="true"]');
```

## .shell vs content

| element | is shell | is content |
|---------|----------|------------|
| `#app` | yes | no |
| `#root` | yes | no |
| `.skeleton` | yes | no |
| `.spinner` | yes | no |
| `#user-list:empty` | yes | no |
| `#user-list .user-row` | no | yes |
| `table tr:not(.header)` | no | yes |
| `[data-testid="user-card"]` | no | yes |

## .examples

### list content

```typescript
import { BadRequestError } from 'helpful-errors';

// wait for list to have items
await page.waitForSelector('#users .user-item', { timeout: 10000 });

// verify minimum items
const items = await page.$$('#users .user-item');
if (items.length === 0) {
  throw new BadRequestError('user list is empty', {
    hint: 'check if data loaded or if selector matches rendered items',
  });
}
```

### table content

```typescript
import { BadRequestError } from 'helpful-errors';

// wait for table rows (not header)
await page.waitForSelector('table tbody tr', { timeout: 10000 });

// verify data rows exist
const rows = await page.$$('table tbody tr');
if (rows.length === 0) {
  throw new BadRequestError('table has no data rows', {
    hint: 'check if table data loaded or if auth is required',
  });
}
```

### dashboard content

```typescript
import { BadRequestError } from 'helpful-errors';

// wait for dashboard widgets to load
await page.waitForSelector('[data-widget-loaded="true"]', { timeout: 15000 });

// verify widget has content
const widgetContent = await page.textContent('[data-widget]');
if (!widgetContent || widgetContent.trim().length === 0) {
  throw new BadRequestError('widget is empty', {
    hint: 'check if widget data source returned empty or if selector is correct',
  });
}
```

## .detection via attributes

many SPAs set attributes when content loads:

```typescript
// wait for React hydration
await page.waitForSelector('[data-reactroot]');

// wait for Vue mount
await page.waitForFunction(() => window.__VUE_APP__?.$el);

// wait for custom load flag
await page.waitForSelector('[data-loaded="true"]');
```

## .skeleton detection

```typescript
// wait for skeleton to disappear
await page.waitForSelector('.skeleton', { state: 'hidden', timeout: 10000 });

// then wait for content to appear
await page.waitForSelector('.content-loaded', { timeout: 5000 });
```

## .enforcement

wait for shell element without content verification = blocker

## .see also

- `rule.require.wait-for-react-render.md` — React-specific waits
- `rule.require.wait-for-target-element.md` — target element patterns
