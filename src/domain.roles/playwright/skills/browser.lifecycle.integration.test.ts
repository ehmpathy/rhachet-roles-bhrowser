import { given, then, useThen, when } from 'test-fns';

import { existsSync, readFileSync } from 'node:fs';
import {
  asStableSnapshot,
  getWsEndpointFile,
  rhx,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

/**
 * .what = integration tests for browser lifecycle skills
 *
 * .why = verify browser.start, browser.stop, browser.describe work correctly
 */
describe('browser.lifecycle', () => {
  const session = 'test-lifecycle';

  afterAll(() => {
    stopBrowser(session);
  });

  given('[case1] no browser active', () => {
    beforeAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.start is called in headless mode', () => {
      const result = useThen('browser starts successfully', () =>
        skillFull(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output contains browser.start header', () => {
        expect(result.stdout).toContain('browser.start');
      });

      then('ws-endpoint file is created', () => {
        const wsFile = getWsEndpointFile(session);
        expect(existsSync(wsFile)).toBe(true);
      });

      then('ws-endpoint contains valid ws url', () => {
        const wsFile = getWsEndpointFile(session);
        const content = readFileSync(wsFile, 'utf-8').trim();
        expect(content).toMatch(/^ws:\/\/localhost:\d+\/devtools\/browser\//);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t1] browser.describe is called', () => {
      const result = useThen('describe succeeds', () =>
        skillFull(`browser.describe --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output contains browser.describe header', () => {
        expect(result.stdout).toContain('browser.describe');
      });

      then('output lists at least one tab', () => {
        // output format: [0] New Tab ← focused
        expect(result.stdout).toMatch(/\[\d+\]/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t2] browser.stop is called', () => {
      const result = useThen('stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output contains browser.stop header', () => {
        expect(result.stdout).toContain('browser.stop');
      });

      then('ws-endpoint file is removed', () => {
        const wsFile = getWsEndpointFile(session);
        expect(existsSync(wsFile)).toBe(false);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] browser already active', () => {
    beforeAll(() => {
      stopBrowser(session);
      rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.start is called again', () => {
      const result = useThen('start returns constraint error', () =>
        skillNoThrow(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates browser already active', () => {
        expect(result.combined).toMatch(/already|active/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t1] browser.stop is called twice', () => {
      // first stop
      const firstResult = useThen('first stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      // second stop (should be idempotent)
      const secondResult = useThen('second stop is idempotent', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('first stop has exit code 0', () => {
        expect(firstResult.exitCode).toBe(0);
      });

      then('second stop has exit code 0 (idempotent)', () => {
        expect(secondResult.exitCode).toBe(0);
      });
    });
  });

  given('[case3] browser not active', () => {
    beforeAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.describe is called', () => {
      const result = useThen('describe returns constraint error', () =>
        skillNoThrow(`browser.describe --session ${session}`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates no active browser', () => {
        expect(result.combined).toMatch(/not (found|active)|no.*browser/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case4] start requires explicit mode', () => {
    when('[t0] browser.start is called without mode', () => {
      const result = useThen('start returns constraint error', () =>
        skillNoThrow(`browser.start --session ${session}`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates mode required', () => {
        expect(result.combined).toMatch(/--mode.*required|HEADFUL|HEADLESS/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });
});
