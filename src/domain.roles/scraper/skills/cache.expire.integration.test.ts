import { given, then, useBeforeAll, useThen, when } from 'test-fns';

import { existsSync } from 'node:fs';
import {
  asStableSnapshot,
  cleanupCacheDir,
  createCacheFile,
  hashEmail,
  setupCacheDir,
  skillFull,
  skillNoThrow,
} from './.test/infra/cache';

describe('cache.expire', () => {
  given('[case1] cache files exist for account', () => {
    const email = 'test@example.com';
    const emailHash = hashEmail(email);

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      const file1 = createCacheFile(
        cacheDir,
        'getProfile',
        emailHash,
        'abc123',
        {
          data: { name: 'Test User' },
          expiresAtMse: Date.now() + 86400000,
        },
      );
      const file2 = createCacheFile(
        cacheDir,
        'getSubscriptions',
        emailHash,
        'def456',
        {
          data: { active: true },
          expiresAtMse: Date.now() + 86400000,
        },
      );
      return { cacheDir, file1, file2 };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.expire is called', () => {
      const result = useThen('it succeeds', () =>
        skillFull(`cache.expire --for ${email} --cache-dir ${scene.cacheDir}`),
      );

      then('output shows lizard vibes header', () => {
        expect(result.stdout).toContain('toasty');
      });

      then('output shows account info', () => {
        expect(result.stdout).toContain(`account: ${email}`);
        expect(result.stdout).toContain(`hash: ${emailHash}`);
      });

      then('output shows files count', () => {
        expect(result.stdout).toContain('files: 2');
      });

      then('output lists deleted files', () => {
        expect(result.stdout).toContain('getProfile');
        expect(result.stdout).toContain('getSubscriptions');
      });

      then('cache files are deleted', () => {
        expect(existsSync(scene.file1)).toBe(false);
        expect(existsSync(scene.file2)).toBe(false);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] no cache files exist for account', () => {
    const email = 'nobody@example.com';

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.expire is called', () => {
      const result = useThen('it succeeds', () =>
        skillFull(`cache.expire --for ${email} --cache-dir ${scene.cacheDir}`),
      );

      then('output shows cold snap', () => {
        expect(result.stdout).toContain('cold snap');
      });

      then('output shows zero files', () => {
        expect(result.stdout).toContain('files: 0');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case3] --for is not provided', () => {
    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.expire is called without --for', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(`cache.expire --cache-dir ${scene.cacheDir}`),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('--for required');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case4] --cache-dir is not provided', () => {
    when('[t0] cache.expire is called without --cache-dir', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(`cache.expire --for test@example.com`),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('--cache-dir required');
      });

      then('stderr shows hint', () => {
        expect(result.stderr).toContain('hint:');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case5] cache dir has mixed files (some match, some do not)', () => {
    const email = 'user@example.com';
    const emailHash = hashEmail(email);
    const otherHash = hashEmail('other@example.com');

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      const targetFile = createCacheFile(
        cacheDir,
        'getProfile',
        emailHash,
        'abc123',
        { data: {} },
      );
      const otherFile = createCacheFile(
        cacheDir,
        'getProfile',
        otherHash,
        'xyz789',
        { data: {} },
      );
      return { cacheDir, targetFile, otherFile };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.expire is called', () => {
      const result = useThen('it succeeds', () =>
        skillFull(`cache.expire --for ${email} --cache-dir ${scene.cacheDir}`),
      );

      then('only target account files are deleted', () => {
        expect(existsSync(scene.targetFile)).toBe(false);
        expect(existsSync(scene.otherFile)).toBe(true);
      });

      then('output shows 1 file', () => {
        expect(result.stdout).toContain('files: 1');
      });
    });
  });

  given('[case6] --help', () => {
    when('[t0] cache.expire is called with --help', () => {
      const result = useThen('shows help', () =>
        skillNoThrow('cache.expire --help'),
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
