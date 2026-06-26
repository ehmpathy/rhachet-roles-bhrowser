# rule.forbid.coordinate-clicks

## .what

never click by coordinates. always use CSS selectors.

## .why

coordinate clicks are brittle:
- viewport size changes break them
- responsive layouts shift elements
- dynamic content loads in different positions
- zoom levels affect coordinates
- different screens have different dimensions

CSS selectors are stable:
- tied to element identity, not position
- survive layout changes
- work across viewport sizes
- self-document what is clicked

## .pattern

```typescript
// 🚫 forbidden: coordinate click
await page.mouse.click(1420, 695);

// ✓ required: selector click
await page.click('[data-testid="chat-widget"]');
await page.click('button[aria-label="Open chat"]');
await page.locator('.chat-launcher').click();
```

## .when you cannot find a selector

if no obvious selector exists:

1. **snapshot the HTML** — search for the element
2. **use text content** — `page.getByText('Chat with us')`
3. **use role** — `page.getByRole('button', { name: 'Chat' })`
4. **use position relative to parent** — `page.locator('.widget-container > button').first()`
5. **ask the human** — if truly no selector works, escalate

never fall back to coordinates.

## .exception

none. there is no valid case for coordinate clicks in automation.

## .enforcement

coordinate click (`page.mouse.click(x, y)`) = blocker

