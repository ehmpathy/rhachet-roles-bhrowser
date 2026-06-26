import { given, then, useThen, when } from 'test-fns';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  asStableSnapshot,
  CACHE_ROOT,
  rhx,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

/**
 * .what = integration tests for browser.action skill
 *
 * .why = verify playbook execution works correctly
 */
describe('browser.action', () => {
  const session = 'test-action';
  const playDir = `${CACHE_ROOT}/test-playbooks`;

  // create test playbook
  const createPlaybook = (name: string, content: string): string => {
    if (!existsSync(playDir)) mkdirSync(playDir, { recursive: true });
    const path = `${playDir}/${name}.play.ts`;
    writeFileSync(path, content);
    return path;
  };

  beforeAll(() => {
    stopBrowser(session);
    rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
  });

  afterAll(() => {
    stopBrowser(session);
  });

  given('[case1] valid playbook', () => {
    const playbook = createPlaybook(
      'goto-example',
      `
import type { Page, Browser } from 'playwright';

export const action = async (input: { page: Page; browser: Browser }) => {
  await input.page.goto('about:blank');
  return { status: 'ok' };
};
`,
    );

    when('[t0] browser.action is called with --play', () => {
      const result = useThen('playbook executes', () =>
        skillFull(`browser.action --session ${session} --play ${playbook}`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output contains playbook header', () => {
        expect(result.stdout).toContain('run playbook');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] playbook not found', () => {
    when('[t0] browser.action is called with nonexistent playbook', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(
          `browser.action --session ${session} --play ${playDir}/nonexistent.play.ts`,
        ),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates playbook not found', () => {
        expect(result.combined).toMatch(/not found|does not exist/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case3] tab selection via --tab', () => {
    const playbook = createPlaybook(
      'simple-action',
      `
import type { Page, Browser } from 'playwright';

export const action = async (input: { page: Page; browser: Browser }) => {
  return { title: await input.page.title() };
};
`,
    );

    when('[t0] browser.action called with --tab 0', () => {
      const result = useThen('uses specified tab', () =>
        skillFull(
          `browser.action --session ${session} --play ${playbook} --tab 0`,
        ),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows tab index', () => {
        expect(result.stdout).toContain('tab: 0');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case4] playbook with error', () => {
    const playbook = createPlaybook(
      'error-playbook',
      `
import type { Page, Browser } from 'playwright';
import { UnexpectedCodePathError } from 'helpful-errors';

export const action = async (input: { page: Page; browser: Browser }) => {
  throw new UnexpectedCodePathError('intentional test error', { hint: 'test playbook designed to fail' });
};
`,
    );

    when('[t0] browser.action is called', () => {
      const result = useThen('returns error', () =>
        skillNoThrow(`browser.action --session ${session} --play ${playbook}`),
      );

      then('exit code is 1 (malfunction)', () => {
        expect(result.exitCode).toBe(1);
      });

      then('output contains error message', () => {
        expect(result.combined).toContain('intentional test error');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case5] --play argument absent', () => {
    when('[t0] browser.action is called without --play', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(`browser.action --session ${session}`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates --play required', () => {
        expect(result.combined).toMatch(/--play.*required/i);
      });

      then('output shows usage hint', () => {
        expect(result.combined).toMatch(/├─ usage/);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case6] without browser', () => {
    const noSession = 'action-no-browser';
    const playbook = createPlaybook(
      'no-browser-playbook',
      `
import type { Page, Browser } from 'playwright';

export const action = async (input: { page: Page; browser: Browser }) => {
  return { status: 'ok' };
};
`,
    );

    when('[t0] browser.action is called without active browser', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(
          `browser.action --session ${noSession} --play ${playbook}`,
        ),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates no browser found', () => {
        expect(result.combined).toMatch(/no browser found/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case7] --help', () => {
    when('[t0] browser.action is called with --help', () => {
      const result = useThen('shows help', () =>
        skillNoThrow('browser.action --help'),
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
