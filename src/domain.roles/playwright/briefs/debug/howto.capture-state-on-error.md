# howto.capture-state-on-error

## .what

automatically capture browser state when errors occur.

## .why

errors are transient:
- page state changes after error
- console messages scroll away
- network requests complete
- element disappears

capture immediately preserves evidence.

## .pattern

```typescript
import { HelpfulError } from 'helpful-errors';

/**
 * .what = get current timestamp in milliseconds
 * .why = isolates Date.now() call from orchestrator
 */
const asTimestamp = (): number => Date.now();

/**
 * .what = get current time as ISO string
 * .why = isolates Date conversion from orchestrator
 */
const asIsoTimestamp = (): string => new Date().toJSON();

/**
 * .what = get capture directory path with fallback to timestamp
 * .why = isolates nullable coalesce + path construction
 */
const asCaptureDir = (input: { captureId: string | null }): string =>
  `.cache/errors/${input.captureId ?? String(asTimestamp())}`;

/**
 * .what = wrap browser action with automatic error state capture
 * .why = preserves evidence when errors occur for post-mortem analysis
 */
export const action = async (
  input: Record<string, never>,
  context: { page: Page; browser: Browser },
) => {
  return HelpfulError.wrap(
    async () => {
      await riskyOperation(context.page);
      return { success: true };
    },
    {
      message: 'browser action failed',
      metadata: { url: context.page.url() },
      onError: async (error) => {
        // capture state before it changes
        await setErrorSnapshot({ error, captureId: null }, { page: context.page });
      },
    },
  )();
};

/**
 * .what = persist browser state snapshot when error occurs
 * .why = preserves screenshot, html, and error details for diagnosis
 */
const setErrorSnapshot = async (
  // captureId nullable: caller may not have identifier; defaults to timestamp
  input: { error: Error; captureId: string | null },
  context: { page: Page },
) => {
  // derive artifact path via named transformer
  const dirError = asCaptureDir({ captureId: input.captureId });
  await fs.mkdir(dirError, { recursive: true });

  // screenshot
  await context.page.screenshot({
    path: `${dirError}/screenshot.png`,
    fullPage: true,
  });

  // html
  await fs.writeFile(`${dirError}/page.html`, await context.page.content());

  // console logs (captured earlier via event handler - not available in error handler)
  // .note = console messages should be captured proactively, not in error handler

  // error details
  await fs.writeFile(`${dirError}/error.json`, JSON.stringify({
    message: input.error.message,
    stack: input.error.stack,
    url: context.page.url(),
    title: await context.page.title(),
    time: asIsoTimestamp(),
  }, null, 2));
};
```

## .wrapper pattern

```typescript
import { HelpfulError } from 'helpful-errors';

/**
 * .what = higher-order function that wraps playbooks with error snapshot
 * .why = enables consistent error state capture across all playbooks
 */
const withErrorSnapshot = <I, R>(
  action: (input: I, context: { page: Page }) => Promise<R>
) => {
  return async (input: I, context: { page: Page }): Promise<R> => {
    return HelpfulError.wrap(
      async () => action(input, context),
      {
        message: 'browser action failed',
        metadata: { url: context.page.url() },
        onError: async (error) => {
          // capture state before re-throw
          await setErrorSnapshot({ error, captureId: null }, { page: context.page });
        },
      },
    )();
  };
};

// usage: define _action then wrap
/**
 * .what = submit form and wait for success
 * .why = demonstrates error capture wrapper pattern
 */
const _action = async (
  input: Record<string, never>,
  context: { page: Page },
) => {
  await context.page.click('#submit');
  await context.page.waitForURL('**/success');
  return { success: true };
};

export const action = withErrorSnapshot(_action);
```

## .captured artifacts

| artifact | content | use |
|----------|---------|-----|
| screenshot.png | visual state | see what user would see |
| page.html | dom snapshot | search for elements |
| console.log | browser console | errors, warnings |
| network.json | request/response | endpoint failures |
| storage.json | cookies, localStorage | auth state |
| error.json | error details | stack trace, context |

## .network capture

```typescript
interface NetworkEntry {
  url: string;
  method?: string;
  status?: number;
  headers: Record<string, string>;
  time: string;
}

/**
 * .what = create network entry from playwright request
 * .why = pure transformer for request data extraction
 */
const asNetworkEntryFromRequest = (input: { req: Request }): NetworkEntry => ({
  url: input.req.url(),
  method: input.req.method(),
  headers: input.req.headers(),
  time: asIsoTimestamp(),
});

/**
 * .what = create network entry from playwright response
 * .why = pure transformer for response data extraction
 */
const asNetworkEntryFromResponse = (input: { res: Response }): NetworkEntry => ({
  url: input.res.url(),
  status: input.res.status(),
  headers: input.res.headers(),
  time: asIsoTimestamp(),
});

/**
 * .what = append entry to accumulator array
 * .why = named transformer makes append intent clear without decode
 */
const appendToAccumulator = <T>(accumulator: T[], entry: T): void => {
  accumulator.push(entry);
};

/**
 * .what = set up network snapshot capture and return flush function
 * .why = enables capture of request/response data for error diagnosis
 */
const setNetworkSnapshotCapture = (input: { page: Page; dir: string }) => {
  // accumulator for network entries - playwright events append via callback
  const entriesAccumulator: NetworkEntry[] = [];

  // capture request data when fired
  input.page.on('request', (req) => {
    const entry = asNetworkEntryFromRequest({ req });
    appendToAccumulator(entriesAccumulator, entry);
  });

  // capture response data when fired
  input.page.on('response', (res) => {
    const entry = asNetworkEntryFromResponse({ res });
    appendToAccumulator(entriesAccumulator, entry);
  });

  // return flush function to persist captured data
  return async () => {
    // snapshot entries at flush time (immutable copy)
    const entriesSnapshot = [...entriesAccumulator];
    await fs.writeFile(`${input.dir}/network.json`, JSON.stringify(entriesSnapshot, null, 2));
  };
};
```

## .test integration

```typescript
import { UnexpectedCodePathError } from 'helpful-errors';

// in test setup - capture state on failure for diagnosis
afterEach(async () => {
  if (testInfo.status !== 'passed') {
    // .note = capture state for post-mortem; original error already propagated via testInfo
    await setErrorSnapshot(
      {
        error: new UnexpectedCodePathError('test failed', {
          testTitle: testInfo.title,
          testFile: testInfo.file,
          originalError: testInfo.error?.message,
        }),
        captureId: null,
      },
      { page },
    );
  }
});
```

## .see also

- `howto.debug-movie-frames.md` — sequential capture
- `howto.browser-diagnosis.md` — diagnosis workflow
