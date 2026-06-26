# rule.require.wait-for-react-render

## .what

wait for React components to fully render before interaction.

## .why

React renders async:
- initial render shows null/placeholder
- useEffect runs after paint
- data fetches trigger re-render
- suspense shows fallback

interact only after target component stabilizes.

## .pattern

### wait for hydration

```typescript
/**
 * .what = check if React root element is hydrated
 * .why = hydration markers indicate React has attached event handlers
 * .note = `as any` cast exception at external boundary:
 *         - why: React internal `_reactRootContainer` absent from public types
 *         - correct type: `{ _reactRootContainer?: { _internalRoot: unknown } }`
 *         - removal: awaits React to expose hydration state via public API
 *         - ref: https://github.com/facebook/react/issues/17907
 */
const isReactHydrated = (input: { root: Element | null }): boolean => {
  if (!input.root) return false;
  const hasReactRoot = input.root.hasAttribute('data-reactroot');
  // .note = as any cast: React internal, see jsdoc for exception rationale
  const hasReactContainer = (input.root as any)._reactRootContainer != null;
  return hasReactRoot || hasReactContainer;
};

// React 18 hydration complete
await page.waitForFunction(() => {
  const root = document.getElementById('root');
  return isReactHydrated({ root });
});
```

### wait for content render

```typescript
// wait for component to render real content
await page.waitForSelector('[data-testid="user-card"]', { timeout: 10000 });

// verify content is not placeholder
const content = await page.textContent('[data-testid="user-card"]');
if (!content || content.includes('Load')) {
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="user-card"]')?.textContent?.includes('Load'),
    { timeout: 10000 }
  );
}
```

### wait for state update

```typescript
// after action, wait for React to re-render
await page.click('#toggle-view');
await page.waitForSelector('[data-view="list"]', { timeout: 5000 });
```

## .common React patterns

### suspense boundaries

```typescript
// wait for suspense fallback to complete
await page.waitForSelector('.suspense-content:not(.fallback)', { timeout: 15000 });
```

### lazy components

```typescript
// wait for lazy component to load
await page.waitForSelector('[data-component="LazyDashboard"]', { timeout: 10000 });

// verify component rendered (not just shell)
await page.waitForSelector('[data-component="LazyDashboard"] .dashboard-content');
```

### state transitions

```typescript
// click and wait for state change
await page.click('#submit');

// React state updates are batched
await page.waitForFunction(
  () => document.querySelector('#status')?.textContent === 'Saved',
  { timeout: 5000 }
);
```

## .test attribute patterns

```typescript
// prefer data-testid for stability
await page.waitForSelector('[data-testid="submit-button"]');
await page.click('[data-testid="submit-button"]');
await page.waitForSelector('[data-testid="success-message"]');
```

## .pitfalls

| symptom | cause | fix |
|---------|-------|-----|
| element found but not clickable | render not complete | wait for stable state |
| stale element | component re-rendered | re-query element |
| click does not work | event handler not attached | wait for hydration |
| wrong text | state not updated | waitForFunction |

## .enforcement

interact with React component without render verification = blocker

## .see also

- `rule.require.wait-for-content-not-shell.md` — content vs shell
- `rule.require.wait-for-target-element.md` — target patterns
