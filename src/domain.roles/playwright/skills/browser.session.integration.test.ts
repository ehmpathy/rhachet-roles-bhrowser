import { given, then, useThen, when } from 'test-fns';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  asStableSnapshot,
  CACHE_ROOT,
  rhx,
  rhxNoThrow,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

/**
 * .what = integration tests for browser.session skill
 *
 * .why = verify browser.session get/set/del work correctly for
 *        cross-session authentication via storageState
 */
describe('browser.session', () => {
  const session = 'test-session';
  const sessionDir = `${CACHE_ROOT}/browser.${session}`;
  const storageStateFile = `${sessionDir}/storageState.json`;

  // sample storageState for test
  const sampleStorageState = {
    cookies: [
      {
        name: 'session_token',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
      {
        name: 'csrf',
        value: 'xyz789',
        domain: 'example.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: 'Strict',
      },
    ],
    origins: [
      {
        origin: 'https://example.com',
        localStorage: [
          { name: 'user_prefs', value: '{"theme":"dark"}' },
          { name: 'cart_items', value: '[]' },
        ],
      },
    ],
  };

  afterAll(() => {
    stopBrowser(session);
  });

  given('[case1] no session state', () => {
    beforeAll(() => {
      // clean up any prior state
      stopBrowser(session);
      // .note = rhxNoThrow never throws; rm -rf is idempotent (no error if file absent)
      rhxNoThrow(`rm -rf ${storageStateFile}`);
    });

    when('[t0] browser.session get is called', () => {
      const result = useThen('get returns no state', () =>
        skillFull(`browser.session get --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output indicates no state', () => {
        expect(result.stdout).toMatch(/state:\s*none/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t1] browser.session del is called', () => {
      const result = useThen('del is idempotent', () =>
        skillFull(`browser.session del --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output indicates already clear', () => {
        expect(result.stdout).toMatch(/already clear/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] set from file path', () => {
    const sourceFile = `${CACHE_ROOT}/test-source-state.json`;

    beforeAll(() => {
      // clean up any prior state
      stopBrowser(session);
      // .note = rhxNoThrow never throws; rm -rf is idempotent (no error if file absent)
      rhxNoThrow(`rm -rf ${storageStateFile}`);
      // write sample state to source file
      mkdirSync(CACHE_ROOT, { recursive: true });
      writeFileSync(sourceFile, JSON.stringify(sampleStorageState, null, 2));
    });

    when('[t0] browser.session set --from path is called', () => {
      const result = useThen('set from file succeeds', () =>
        skillFull(
          `browser.session set --session ${session} --from ${sourceFile}`,
        ),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output shows source file', () => {
        expect(result.stdout).toContain(sourceFile);
      });

      then('output shows cookies count', () => {
        expect(result.stdout).toMatch(/cookies:\s*2/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });

      then('storageState file is created', () => {
        expect(existsSync(storageStateFile)).toBe(true);
      });

      then('storageState contains expected content', () => {
        const content = JSON.parse(readFileSync(storageStateFile, 'utf-8'));
        expect(content.cookies).toHaveLength(2);
        expect(content.origins).toHaveLength(1);
      });
    });

    when('[t1] browser.session get is called after set', () => {
      const result = useThen('get shows state', () =>
        skillFull(`browser.session get --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows cookies count', () => {
        expect(result.stdout).toMatch(/cookies:\s*2/);
      });

      then('output shows localStorage keys', () => {
        expect(result.stdout).toContain('user_prefs');
        expect(result.stdout).toContain('cart_items');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t2] browser.session del is called', () => {
      const result = useThen('del succeeds', () =>
        skillFull(`browser.session del --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output indicates cleared', () => {
        expect(result.stdout).toMatch(/state:\s*cleared/);
      });

      then('storageState file is removed', () => {
        expect(existsSync(storageStateFile)).toBe(false);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case3] set from nonexistent file', () => {
    when('[t0] browser.session set --from nonexistent path', () => {
      const result = useThen('set fails with constraint error', () =>
        skillNoThrow(
          `browser.session set --session ${session} --from /nonexistent/path.json`,
        ),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates file not found', () => {
        expect(result.combined).toMatch(/not found/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case4] set from @storage with active browser', () => {
    beforeAll(() => {
      // clean up any prior state
      stopBrowser(session);
      // .note = rhxNoThrow never throws; rm -rf is idempotent (no error if file absent)
      rhxNoThrow(`rm -rf ${storageStateFile}`);
      // start browser
      rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.session set --from @storage is called', () => {
      const result = useThen('set from @storage succeeds', () =>
        skillFull(`browser.session set --session ${session} --from @storage`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output shows source as @storage', () => {
        expect(result.stdout).toContain('@storage');
      });

      then('storageState file is created', () => {
        expect(existsSync(storageStateFile)).toBe(true);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case5] set from @storage with no browser', () => {
    beforeAll(() => {
      // ensure no browser active
      stopBrowser(session);
      // .note = rhxNoThrow never throws; rm -rf is idempotent (no error if file absent)
      rhxNoThrow(`rm -rf ${storageStateFile}`);
    });

    when('[t0] browser.session set --from @storage is called', () => {
      const result = useThen('set fails with constraint error', () =>
        skillNoThrow(
          `browser.session set --session ${session} --from @storage`,
        ),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates no browser', () => {
        expect(result.combined).toMatch(/no browser found/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case6] absent arguments', () => {
    when('[t0] browser.session is called without subcommand', () => {
      const result = useThen('fails with constraint error', () =>
        skillNoThrow(`browser.session`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output shows usage', () => {
        expect(result.combined).toMatch(/└─ usage/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t1] browser.session set is called without --from', () => {
      const result = useThen('fails with constraint error', () =>
        skillNoThrow(`browser.session set --session ${session}`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates --from required', () => {
        expect(result.combined).toMatch(/--from required/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t2] browser.session get is called without --session', () => {
      const result = useThen('fails with constraint error', () =>
        skillNoThrow(`browser.session get`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates --session required', () => {
        expect(result.combined).toMatch(/--session required/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case7] --help', () => {
    when('[t0] browser.session is called with --help', () => {
      const result = useThen('shows help', () =>
        skillNoThrow('browser.session --help'),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows usage', () => {
        expect(result.combined).toMatch(/usage:/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });
});
