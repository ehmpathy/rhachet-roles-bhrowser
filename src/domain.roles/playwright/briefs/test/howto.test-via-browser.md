# howto.test-via-browser

## .what

patterns for browser-based test automation.

## .test structure

```typescript
import { given, when, then, useThen } from 'test-fns';
import { browserTestUtils } from './.test/infra/browserTestUtils';

describe('feature.name', () => {
  const session = 'test-feature';

  // start browser once for all tests
  beforeAll(() => {
    browserTestUtils.stopBrowser({ session });  // clean prior state
    browserTestUtils.rhx({ cmd: `rhx browser.start --session ${session} --mode HEADLESS` });
  });

  afterAll(() => {
    browserTestUtils.stopBrowser({ session });
  });

  given('[case1] scenario description', () => {
    when('[t0] action is performed', () => {
      const result = useThen('action succeeds', () =>
        browserTestUtils.rhxFull({ cmd: `rhx browser.action --session ${session} --play ./test.play.ts` }),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains expected value', () => {
        expect(result.stdout).toContain('success');
      });
    });
  });
});
```

## .test infrastructure

test utilities export a single composite object (similar to dao pattern).
this follows single-responsibility by export of one named entity per file.

```typescript
// .test/infra/browserTestUtils.ts
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { UnexpectedCodePathError } from 'helpful-errors';

const CACHE_ROOT = '.temp/.cache';

// hermetic paths - use repo-relative binaries, not host PATH
const REPO_ROOT = path.join(__dirname, '../../../..');
const RHX_BIN = `${REPO_ROOT}/node_modules/.bin/rhx`;

/**
 * .what = execute rhx command and return stdout
 * .why = enables skill invocation in tests with hermetic paths
 */
const rhx = (input: { cmd: string }): string => {
  // replace 'rhx' prefix with absolute path for hermetic execution
  const hermeticCmd = input.cmd.replace(/^rhx /, `${RHX_BIN} `);
  return execSync(hermeticCmd, {
    env: { ...process.env, CACHE_ROOT },
  }).toString();
};

/**
 * .what = execute rhx command and return full result object
 * .why = enables assertions on exit code, stdout, stderr
 */
const rhxFull = (input: { cmd: string }) => {
  // replace 'rhx' prefix with absolute path for hermetic execution
  const hermeticCmd = input.cmd.replace(/^rhx /, `${RHX_BIN} `);
  const result = spawnSync('/bin/bash', ['-c', hermeticCmd], {
    encoding: 'utf-8',
    env: { ...process.env, CACHE_ROOT },
  });

  if (result.error)
    throw new UnexpectedCodePathError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    throw new UnexpectedCodePathError('skill command failed', {
      command: input.cmd,
      exitCode,
      stderr: result.stderr,
      hint: 'check stderr for details',
    });
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: 0,
    combined: `${result.stdout || ''}${result.stderr || ''}`,
  };
};

/**
 * .what = execute rhx command and return result without error on non-zero exit
 * .why = enables tests that expect non-zero exit codes
 */
const rhxNoThrow = (input: { cmd: string }) => {
  // replace 'rhx' prefix with absolute path for hermetic execution
  const hermeticCmd = input.cmd.replace(/^rhx /, `${RHX_BIN} `);
  const result = spawnSync('/bin/bash', ['-c', hermeticCmd], {
    encoding: 'utf-8',
    env: { ...process.env, CACHE_ROOT },
  });

  if (result.error)
    throw new UnexpectedCodePathError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode: result.status ?? 1,
  };
};

/**
 * .what = stop browser session for test cleanup
 * .why = ensures clean state between tests
 * .note = uses rhxNoThrow because browser may already be stopped (exit 2)
 */
const stopBrowser = (input: { session: string }) => {
  const result = rhxNoThrow({ cmd: `rhx browser.stop --session ${input.session}` });
  // exit 0 = success, exit 2 = constraint (already stopped) - both acceptable
  // exit 1 = malfunction - must throw to surface real errors
  if (result.exitCode === 1) {
    throw new UnexpectedCodePathError('stopBrowser malfunction', {
      session: input.session,
      exitCode: result.exitCode,
      stderr: result.stderr,
      hint: 'browser stop failed unexpectedly - check stderr for details',
    });
  }
};

/**
 * .what = replace iso timestamps with stable placeholder
 * .why = timestamps vary per run; placeholder enables deterministic snapshots
 */
const asTimestampStable = (input: { output: string }): string =>
  input.output.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP');

/**
 * .what = replace snapshot numeric ids with stable placeholder
 * .why = snapshot ids vary per run; placeholder enables deterministic snapshots
 */
const asSnapshotIdStable = (input: { output: string }): string =>
  input.output.replace(/snapshot\.\d+/g, 'snapshot.TIMESTAMP');

/**
 * .what = replace websocket endpoints with stable placeholder
 * .why = ws endpoints vary per browser instance; placeholder enables deterministic snapshots
 */
const asWsEndpointStable = (input: { output: string }): string =>
  input.output.replace(/ws:\/\/[^"]+/g, 'ws://WS_ENDPOINT');

/**
 * .what = replace dynamic values in output with stable placeholders
 * .why = enables deterministic snapshot comparisons
 */
const asStableSnapshot = (input: { output: string }): string => {
  // replace timestamps with placeholder
  const withTimestamp = asTimestampStable({ output: input.output });

  // replace snapshot ids with placeholder
  const withSnapshotId = asSnapshotIdStable({ output: withTimestamp });

  // replace websocket endpoints with placeholder
  const withWsEndpoint = asWsEndpointStable({ output: withSnapshotId });

  return withWsEndpoint;
};

/**
 * .what = browser test utilities composite
 * .why = single export per file; groups related test utilities
 */
export const browserTestUtils = {
  CACHE_ROOT,
  rhx,
  rhxFull,
  rhxNoThrow,
  stopBrowser,
  asStableSnapshot,
};
```

## .test categories

### unit tests

test pure transformers used within playbooks (no browser boundary):

```typescript
import { given, when, then } from 'test-fns';

describe('asItemFromElement', () => {
  given('[case1] element with name and price', () => {
    const mockElement = {
      querySelector: (selector: string) => ({
        textContent: selector === '.name' ? 'Widget' : '$19.99',
      }),
    } as unknown as Element;

    when('[t0] transformer is called', () => {
      then('extracts fields correctly', () => {
        const result = asItemFromElement({ el: mockElement });
        expect(result.name).toBe('Widget');
        expect(result.price).toBe('$19.99');
      });
    });
  });
});
```

note: playbook actions that interact with browser belong in integration tests.
unit tests cover only pure logic extracted into transformers.

### integration tests

test skill execution end-to-end:

```typescript
describe('browser.snapshot', () => {
  given('[case1] browser with page', () => {
    when('[t0] snapshot is called', () => {
      const result = useThen('snapshot succeeds', () =>
        browserTestUtils.rhxFull({ cmd: `rhx browser.snapshot --session ${session} --focused` }),
      );

      then('files are created', () => {
        expect(existsSync(`${browserTestUtils.CACHE_ROOT}/browser.${session}/snapshot.*/snapshot.png`)).toBe(true);
      });
    });
  });
});
```

### acceptance tests

test full user journeys:

```typescript
describe('login journey', () => {
  given('[case1] user with valid credentials', () => {
    when('[t0] login flow is completed', () => {
      // start → navigate → fill → submit → verify
      browserTestUtils.rhx({ cmd: `rhx browser.start --session ${session} --mode HEADLESS` });
      browserTestUtils.rhx({ cmd: `rhx browser.action --session ${session} --play ./goto-login.play.ts` });
      browserTestUtils.rhx({ cmd: `rhx browser.action --session ${session} --play ./fill-login.play.ts` });
      browserTestUtils.rhx({ cmd: `rhx browser.action --session ${session} --play ./submit-login.play.ts` });

      then('session is authenticated', () => {
        const result = browserTestUtils.rhxFull({ cmd: `rhx browser.describe --session ${session}` });
        expect(result.stdout).toContain('/dashboard');
      });
    });
  });
});
```

## .see also

- `rule.forbid.test-goto.md` — avoid goto in tests
- `rule.require.fast-tests.md` — test performance
