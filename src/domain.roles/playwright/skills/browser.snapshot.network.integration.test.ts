import { given, then, when } from 'test-fns';

import {
  asStableSnapshot,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

describe('browser.snapshot.network', () => {
  given('[case1] with active browser', () => {
    const session = 'snapshot-network-case1';

    beforeAll(() => {
      stopBrowser(session);
      skillFull(`browser.start --mode HEADLESS --session ${session}`);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] skill is invoked', () => {
      then('it captures network requests', () => {
        const result = skillFull(
          `browser.snapshot network --tab 0 --url 'chrome://new-tab-page/' --session ${session}`,
        );

        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');

        expect(result.stdout).toContain('snapshot.network.json');
      });
    });
  });

  given('[case2] without --tab', () => {
    when('[t0] skill is invoked without --tab', () => {
      then('it fails with usage message', () => {
        const result = skillNoThrow('browser.snapshot network');

        expect(result.exitCode).toBeGreaterThan(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.stderr).toContain(
          '--focused OR (--tab + --url) required',
        );
      });
    });
  });

  given('[case3] without browser', () => {
    const noSession = 'snapshot-network-no-browser';

    when('[t0] skill is invoked without active browser', () => {
      then('it fails with no browser found', () => {
        const result = skillNoThrow(
          `browser.snapshot network --session ${noSession} --focused`,
        );

        expect(result.exitCode).toBe(2);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.combined).toMatch(/no browser found/i);
      });
    });
  });

  given('[case4] --help', () => {
    when('[t0] skill is invoked with --help', () => {
      then('shows help', () => {
        const result = skillNoThrow('browser.snapshot.network --help');

        expect(result.exitCode).toBe(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.combined).toMatch(/usage:/i);
      });
    });
  });
});
