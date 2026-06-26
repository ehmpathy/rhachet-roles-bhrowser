import { spawnSync } from 'child_process';
import { dirname } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { HelpfulError } from 'helpful-errors';

/**
 * .what = constraint error for caller-must-fix issues (exit 2)
 * .why = semantic error type for test infrastructure
 */
class ConstraintError extends HelpfulError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, metadata);
    this.name = 'ConstraintError';
  }
}

/**
 * .what = malfunction error for server-must-fix issues (exit 1)
 * .why = semantic error type for test infrastructure
 */
class MalfunctionError extends HelpfulError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, metadata);
    this.name = 'MalfunctionError';
  }
}

/**
 * .what = shared test utilities for cache skill integration tests
 */

// test cache root (isolated from main .cache)
export const CACHE_ROOT = '.temp/.cache/scraper-test';

// skills directory (parent of .test/infra)
export const SKILLS_DIR = dirname(dirname(__dirname));

// environment for skill execution
const env = { CACHE_ROOT };

// result of a command execution
export interface SkillResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
}

/**
 * .what = run skill shell executable directly
 * .why = skills may not be linked via rhachet; direct execution allows test
 */
export const skill = (cmd: string): string => {
  const result = skillFull(cmd);
  return result.combined;
};

// run skill executable and return full result
export const skillFull = (cmd: string): SkillResult => {
  // transform 'cache.foo ...' to 'bash $SKILLS_DIR/cache.foo.sh ...'
  const execCmd = cmd.replace(/^(cache\.\S+)/, `bash ${SKILLS_DIR}/$1.sh`);
  const result = spawnSync('bash', ['-c', execCmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  const exitCode = result.status ?? 1;
  const output: SkillResult = {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode,
  };

  // exit 2 = constraint error (caller must fix)
  if (exitCode === 2) {
    throw new ConstraintError('skill constraint not met', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'caller must fix the input or precondition',
    });
  }

  // exit 1 = malfunction (server must fix)
  if (exitCode !== 0) {
    throw new MalfunctionError('skill executable failed', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'check stderr for details or run skill directly to debug',
    });
  }

  return output;
};

// run skill executable without error on non-zero exit
export const skillNoThrow = (cmd: string): SkillResult => {
  const execCmd = cmd.replace(/^(cache\.\S+)/, `bash ${SKILLS_DIR}/$1.sh`);
  const result = spawnSync('bash', ['-c', execCmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
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

// named transformers for snapshot stabilization
const stripAnsiCodes = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const normalizeTempCachePath = (s: string) =>
  s.replace(/\.temp\/\.cache\/scraper-test\//g, '.cache/');
const normalizeCacheTimestamp = (s: string) =>
  s.replace(/\.cache\/\d{10,15}/g, '.cache/TIMESTAMP');

/**
 * .what = redact dynamic values for stable snapshots
 * .why = temp paths change between test runs
 */
export const asStableSnapshot = (output: string) => {
  const stripped = stripAnsiCodes(output);
  const normalized = normalizeTempCachePath(stripped);
  const stable = normalizeCacheTimestamp(normalized);
  return stable;
};

// hash email same way the skill does (first 12 chars of sha256)
export const hashEmail = (email: string): string => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
};

// create test cache directory
export const setupCacheDir = (): string => {
  const cacheDir = `${CACHE_ROOT}/${Date.now()}`;
  mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
};

// create a fake cache file for test
export const createCacheFile = (
  cacheDir: string,
  operation: string,
  emailHash: string,
  inputHash: string,
  content: Record<string, unknown>,
): string => {
  const filename = `${operation}.${emailHash}..${inputHash}.v1.json`;
  const filepath = `${cacheDir}/${filename}`;
  writeFileSync(filepath, JSON.stringify(content, null, 2));
  return filepath;
};

/**
 * .what = cleanup test cache directory
 * .note = rmSync with force:true handles non-existent dirs
 */
export const cleanupCacheDir = (cacheDir: string): void => {
  // force:true means no error if dir doesn't exist
  rmSync(cacheDir, { recursive: true, force: true });
};
