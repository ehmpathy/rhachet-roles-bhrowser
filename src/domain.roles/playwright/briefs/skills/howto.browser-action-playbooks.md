# howto.browser-action-playbooks

## .what

playbooks are TypeScript files that define reusable browser actions.

## .why

playbooks enable:
- reuse across code and robo
- version control
- code review
- composition into larger workflows
- test in isolation

ad-hoc commands are disposable; playbooks are durable.

## .format

```typescript
// login.play.ts
import type { Page } from 'playwright';
import { BadRequestError } from 'helpful-errors';

interface Context {
  loginUrl: string;
  credentials: { email: string; password: string };
}

/**
 * .what = navigate to login page and authenticate with credentials
 * .why = enables authenticated access for subsequent playbook actions
 */
export default async (page: Page, ctx: Context) => {
  // navigate to login page
  await page.goto(ctx.loginUrl);

  // fill credentials
  await page.fill('#email', ctx.credentials.email);
  await page.fill('#password', ctx.credentials.password);

  // submit and wait for redirect
  await page.click('#submit');
  await page.waitForURL('**/dashboard');

  return { success: true, url: page.url() };
};
```

## .invoke from skill

```bash
browser.action --session $SESSION --play ./playbooks/login.play.ts
```

## .invoke from code

```typescript
import login from './playbooks/login.play';

const page = await browser.newPage();
const result = await login(page, {
  loginUrl: 'https://example.com/login',
  credentials: { email: 'user@example.com', password: 'secret' },
});
```

## .signature shape

```typescript
/**
 * .what = one-line description of what this action does
 * .why = one-line description of why this action exists
 */
export default async (page: Page, ctx: Context) => {
  // action logic via page
  // context data via ctx
  return { /* result */ };
};
```

## .return shape

playbooks must return an object:

```typescript
import { UnexpectedCodePathError, BadRequestError } from 'helpful-errors';

// success
return { success: true, data: extractedData };

// unexpected error (runtime issue, server must fix)
throw new UnexpectedCodePathError('action failed: network timeout', {
  url: page.url(),
  hint: 'check network connectivity or retry',
});

// bad request (user must fix)
throw new BadRequestError('action failed: element not found', {
  selector: '#submit-button',
  hint: 'verify page loaded correctly before action',
});
```

## .patterns

### navigation

```typescript
interface Context { url: string }

/**
 * .what = navigate to target url and wait for network to settle
 * .why = ensures page is fully loaded before subsequent actions
 */
export default async (page: Page, ctx: Context) => {
  // navigate and wait for network to settle
  await page.goto(ctx.url);
  await page.waitForLoadState('networkidle');

  return { url: page.url() };
};
```

### form fill

```typescript
interface Context { name: string; email: string }

/**
 * .what = fill and submit a form with provided data
 * .why = encapsulates form interaction for reusable submission flows
 */
export default async (page: Page, ctx: Context) => {
  // fill form fields
  await page.fill('#name', ctx.name);
  await page.fill('#email', ctx.email);

  // submit and wait for success
  await page.click('#submit');
  await page.waitForSelector('.success');

  return { submitted: true };
};
```

### data extraction

```typescript
/**
 * .what = extract item data from element
 * .why = encapsulates dom traversal logic for readability
 */
const asItemFromElement = (input: { el: Element }) => ({
  name: input.el.querySelector('.name')?.textContent ?? null,
  price: input.el.querySelector('.price')?.textContent ?? null,
});

/**
 * .what = extract all items from element array
 * .why = named transformer for element-to-item conversion
 */
const asItemsFromElements = (input: { els: Element[] }) =>
  input.els.map((el) => asItemFromElement({ el }));

interface Context { url: string }

/**
 * .what = extract structured data from page elements
 * .why = enables data scrape patterns with typed return values
 */
export default async (page: Page, ctx: Context) => {
  // navigate to target page
  await page.goto(ctx.url);

  // extract item data from elements
  const items = await page.$$eval('.item', (els) => asItemsFromElements({ els }));

  return { items };
};
```

### multi-step flow

```typescript
interface Context {
  displayName: string;
  credentials: { email: string; password: string };
}

/**
 * .what = execute multi-step workflow with login and preference update
 * .why = demonstrates composition of atomic actions into larger flows
 */
export default async (page: Page, ctx: Context) => {
  // step 1: login
  await page.goto('https://example.com/login');
  await page.fill('#email', ctx.credentials.email);
  await page.fill('#password', ctx.credentials.password);
  await page.click('#submit');
  await page.waitForURL('**/dashboard');

  // step 2: navigate to target
  await page.click('[data-nav="preferences"]');
  await page.waitForSelector('#preferences-form');

  // step 3: update preference
  await page.fill('#display-name', ctx.displayName);
  await page.click('#save');
  await page.waitForSelector('.toast-success');

  return { updated: true };
};
```

## .credentials via context

inject credentials via context, not process.env:

```typescript
import { BadRequestError } from 'helpful-errors';

interface Context {
  loginUrl: string;
  credentials: { email: string; password: string };
}

/**
 * .what = authenticate with injected credentials
 * .why = context injection enables testability and flexibility
 */
export default async (page: Page, ctx: Context) => {
  // navigate to login page
  await page.goto(ctx.loginUrl);

  // fill credentials from context
  await page.fill('#email', ctx.credentials.email);
  await page.fill('#password', ctx.credentials.password);

  // submit and wait for redirect
  await page.click('#submit');
  await page.waitForURL('**/dashboard');

  return { authenticated: true };
};
```

caller provides credentials at invocation:

```typescript
import login from './playbooks/login.play';

// credentials loaded from secure source at call site
const credentials = await getCredentials({ env: 'prod' });

await login(page, {
  loginUrl: 'https://example.com/login',
  credentials,
});
```

## .see also

- `howto.browser-byhand-work.md` — interactive browser work
- `rule.require.playbooks-over-adhoc.md` — why playbooks
