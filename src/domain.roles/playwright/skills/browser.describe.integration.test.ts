import { given, then, when } from 'test-fns';

import {
  asStableSnapshot,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

describe('browser.describe', () => {
  given('[case1] with active browser', () => {
    const session = 'describe-case1';

    beforeAll(() => {
      stopBrowser(session);
      skillFull(`browser.start --mode HEADLESS --session ${session}`);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] skill is invoked', () => {
      then('it shows tabs', () => {
        const result = skillFull(`browser.describe --session ${session}`);

        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');

        expect(result.stdout).toContain('🦎 rock solid');
        expect(result.stdout).toContain('📽️ browser.describe');
        expect(result.stdout).toMatch(/\[\d+\]/); // has tab index
      });
    });
  });

  given('[case2] without browser', () => {
    const session = 'describe-case2';

    beforeAll(() => {
      stopBrowser(session);
    });

    when('[t0] skill is invoked without browser active', () => {
      then('it fails with no browser found error', () => {
        const result = skillNoThrow(`browser.describe --session ${session}`);

        expect(result.exitCode).toBeGreaterThan(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.stderr).toContain('no browser found');
      });
    });
  });

  given('[case3] multiple independent sessions', () => {
    const session1 = 'describe-case3a';
    const session2 = 'describe-case3b';

    beforeAll(() => {
      stopBrowser(session1);
      stopBrowser(session2);
      skillFull(`browser.start --mode HEADLESS --session ${session1}`);
      skillFull(`browser.start --mode HEADLESS --session ${session2}`);
    });

    afterAll(() => {
      stopBrowser(session1);
      stopBrowser(session2);
    });

    when('[t0] each session is described', () => {
      then('shows independent tab state', () => {
        const result1 = skillFull(`browser.describe --session ${session1}`);
        const result2 = skillFull(`browser.describe --session ${session2}`);

        expect(asStableSnapshot(result1.stdout)).toMatchSnapshot(
          'session1 stdout',
        );
        expect(asStableSnapshot(result1.stderr)).toMatchSnapshot(
          'session1 stderr',
        );
        expect(asStableSnapshot(result2.stdout)).toMatchSnapshot(
          'session2 stdout',
        );
        expect(asStableSnapshot(result2.stderr)).toMatchSnapshot(
          'session2 stderr',
        );

        expect(result1.stdout).toContain('tabs:');
        expect(result2.stdout).toContain('tabs:');
        expect(result1.stdout).toContain(session1);
        expect(result2.stdout).toContain(session2);
      });
    });
  });

  given('[case4] --help', () => {
    when('[t0] browser.describe is called with --help', () => {
      then('shows help', () => {
        const result = skillNoThrow('browser.describe --help');

        expect(result.exitCode).toBe(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.combined).toMatch(/usage:/i);
      });
    });
  });
});
