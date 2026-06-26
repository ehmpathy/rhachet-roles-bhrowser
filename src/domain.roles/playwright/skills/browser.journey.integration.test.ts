import { given, then, useThen, when } from 'test-fns';

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  asStableSnapshot,
  CACHE_ROOT,
  getWsEndpointFile,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

/**
 * .what = journey acceptance tests for browser workflow skills
 *
 * .why = verify complete browser workflows work end-to-end:
 *        - happy path (start → describe → action → snapshot → stop)
 *        - blocked state (action fails → snapshot captures error state)
 *        - session handoff (headful auth → session save → headless resume)
 */
describe('browser.journey', () => {
  const session = 'test-journey';

  afterAll(() => {
    stopBrowser(session);
  });

  given('[case1] happy path workflow', () => {
    // playbook for action test
    const playbookDir = path.join(CACHE_ROOT, 'test-playbooks');
    const playbookPath = path.join(playbookDir, 'navigate.play.ts');

    beforeAll(() => {
      stopBrowser(session);
      // create test playbook at given level (not inside when)
      mkdirSync(playbookDir, { recursive: true });
      writeFileSync(
        playbookPath,
        `
import type { Page, Browser } from 'playwright';
export const action = async (input: { page: Page; browser: Browser }) => {
  await input.page.goto('https://example.com');
  return { navigated: true };
};
`.trim(),
      );
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.start launches browser', () => {
      const result = useThen('start succeeds', () =>
        skillFull(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows browser started', () => {
        expect(result.stdout).toContain('browser.start');
        expect(result.stdout).toContain('session');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t1] browser.describe lists tabs', () => {
      const result = useThen('describe succeeds', () =>
        skillFull(`browser.describe --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output lists tabs', () => {
        expect(result.stdout).toMatch(/\[\d+\]/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t2] browser.action runs playbook', () => {
      const result = useThen('action succeeds', () =>
        skillFull(`browser.action --session ${session} --play ${playbookPath}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows url before and after', () => {
        expect(result.stdout).toContain('url');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t3] browser.snapshot captures state', () => {
      const result = useThen('snapshot succeeds', () =>
        skillFull(`browser.snapshot --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows files captured', () => {
        expect(result.stdout).toContain('snapshot');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t4] browser.stop terminates browser', () => {
      const result = useThen('stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows browser stopped', () => {
        expect(result.stdout).toContain('browser.stop');
        expect(result.stdout).toContain('session');
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

  given('[case2] blocked state workflow', () => {
    // playbook that throws error for action failure test
    const playbookDir = path.join(CACHE_ROOT, 'test-playbooks');
    const playbookPath = path.join(playbookDir, 'fail.play.ts');

    beforeAll(() => {
      stopBrowser(session);
      // create error-throw playbook at given level (not inside when)
      mkdirSync(playbookDir, { recursive: true });
      writeFileSync(
        playbookPath,
        `
import type { Page, Browser } from 'playwright';
import { UnexpectedCodePathError } from 'helpful-errors';
export const action = async (input: { page: Page; browser: Browser }) => {
  throw new UnexpectedCodePathError('simulated playbook failure', { hint: 'test playbook designed to fail' });
};
`.trim(),
      );
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.start launches browser', () => {
      const result = useThen('start succeeds', () =>
        skillFull(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });

    when('[t1] browser.describe lists tabs', () => {
      const result = useThen('describe succeeds', () =>
        skillFull(`browser.describe --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });

    when('[t2] browser.action runs playbook that fails', () => {
      const result = useThen('action fails as expected', () =>
        skillNoThrow(
          `browser.action --session ${session} --play ${playbookPath}`,
        ),
      );

      then('exit code is 1 (malfunction)', () => {
        expect(result.exitCode).toBe(1);
      });

      then('stderr contains UnexpectedCodePathError', () => {
        expect(result.stderr).toContain('UnexpectedCodePathError');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t3] browser.snapshot captures error state', () => {
      const result = useThen('snapshot succeeds', () =>
        skillFull(`browser.snapshot --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('snapshot was captured despite action failure', () => {
        expect(result.stdout).toContain('snapshot');
      });
    });

    when('[t4] browser.stop terminates browser', () => {
      const result = useThen('stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });
  });

  given('[case3] session management workflow', () => {
    const sessionDir = path.join(CACHE_ROOT, `browser.${session}`);
    const sessionState = path.join(sessionDir, 'storageState.json');
    const sessionStateBackup = path.join(
      sessionDir,
      'storageState.backup.json',
    );

    beforeAll(() => {
      stopBrowser(session);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser.start launches browser', () => {
      const result = useThen('start succeeds', () =>
        skillFull(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });

    when('[t1] browser.session set saves state to file', () => {
      const result = useThen('session set succeeds', () =>
        skillFull(`browser.session set --session ${session} --from @storage`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('state file is created', () => {
        expect(existsSync(sessionState)).toBe(true);
      });

      then('state file contains valid JSON', () => {
        const content = readFileSync(sessionState, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });

      then('backup copy created for restore test', () => {
        copyFileSync(sessionState, sessionStateBackup);
        expect(existsSync(sessionStateBackup)).toBe(true);
      });
    });

    when('[t2] browser.stop terminates first browser', () => {
      const result = useThen('stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });

    when('[t3] browser.start launches new browser', () => {
      const result = useThen('start succeeds', () =>
        skillFull(`browser.start --session ${session} --mode HEADLESS`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });

    when('[t4] browser.session set restores state from file', () => {
      const result = useThen('session set from file succeeds', () =>
        skillFull(
          `browser.session set --session ${session} --from ${sessionStateBackup}`,
        ),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows state restored', () => {
        expect(result.stdout).toContain('session');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t5] browser.session get shows current state', () => {
      const result = useThen('session get succeeds', () =>
        skillFull(`browser.session get --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains session info', () => {
        expect(result.stdout).toContain('session');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t6] browser.stop terminates browser', () => {
      const result = useThen('stop succeeds', () =>
        skillFull(`browser.stop --session ${session}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });
    });
  });
});
