/**
 * .what = capture localStorage and sessionStorage from browser tab
 * .why = enables storage state debug, importable by code and invokable by shell
 */
import * as fs from 'fs';
import { BadRequestError } from 'helpful-errors';
import type { Page } from 'playwright';

import {
  type ConnectedBrowser,
  emitSnapshotResultError,
  emitSnapshotResultSuccess,
  formatErrorWithContext,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  hasCliFlag,
  isExpectedFsError,
  runSnapshotWithCli,
} from './lib/shared';

export interface SnapshotStorageInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
}

export interface StorageState {
  localStorage: Record<string, string | null>;
  sessionStorage: Record<string, string | null>;
}

export interface SnapshotStorageOutput {
  success: boolean;
  outputFile: string;
  storage?: StorageState;
  error?: string;
}

/**
 * .what = extract storage state from page
 * .why = storage APIs require index-based iteration; immutable via reduce
 * .note = uses string-based evaluate to avoid bundler __name injection in browser context
 * .note = map/reduce are inside named transformers; further extraction not practical
 *         due to browser eval serialization constraints (code executes in browser, not node)
 */
const extractStorageState = async (page: Page): Promise<StorageState> => {
  // browser-context code: defines named transformers, then composes them
  // .note = each function below runs IN THE BROWSER, serialized as a string
  return page.evaluate(`
    (function() {
      // transformer: generate index array [0, 1, ..., length-1]
      // .decode = Array.from with mapper creates indices
      function asIndexArray(input) {
        return Array.from({ length: input.length }, function(_, i) { return i; });
      }

      // transformer: storage.key(index) accessor
      function getKeyAtIndex(input) {
        return input.store.key(input.index);
      }

      // transformer: collect all keys from Storage via map
      // .decode = maps indices to keys via getKeyAtIndex
      function getAllStorageKeys(input) {
        return asIndexArray({ length: input.store.length }).map(function(index) {
          return getKeyAtIndex({ store: input.store, index: index });
        });
      }

      // transformer: fold keys into {key: value} object
      // .decode = reduce accumulates key-value pairs from storage
      function asStorageObject(input) {
        return getAllStorageKeys({ store: input.store }).reduce(
          function(acc, key) {
            if (key !== null) {
              acc[key] = input.store.getItem(key);
            }
            return acc;
          },
          {}
        );
      }

      return {
        localStorage: asStorageObject({ store: localStorage }),
        sessionStorage: asStorageObject({ store: sessionStorage }),
      };
    })()
  `) as Promise<StorageState>; // .note = cast required: page.evaluate returns unknown; shape validated by browser code above
};

/**
 * .what = capture localStorage and sessionStorage from browser tab
 */
export const snapshotStorage = async (
  input: SnapshotStorageInput,
): Promise<SnapshotStorageOutput> => {
  const { browser, tabIndex, outputFile, standalone } = input;

  const pages = getPagesFromPrimaryContext({ browser });
  const page = getPageAtTabIndex({ pages, tabIndex });

  // guard: tab must exist at requested index
  if (!page)
    BadRequestError.throw(`tab ${tabIndex} not found`, {
      tabIndex,
      tabsAvailable: pages.length,
      outputFile,
      hint: 'run browser.describe to list available tabs',
    });

  // wait for content before capture
  await page.waitForLoadState('domcontentloaded');

  // extract storage via named orchestrator
  const storage = await extractStorageState(page);

  try {
    fs.writeFileSync(outputFile, JSON.stringify(storage, null, 2));
  } catch (e) {
    if (!isExpectedFsError({ error: e })) throw e;
    const errorInfo = formatErrorWithContext({ error: e });
    emitSnapshotResultError({
      standalone,
      skillName: 'browser.snapshot storage',
      artifactName: 'snapshot.storage.json',
      errorInfo,
    });
    BadRequestError.throw('failed to write storage snapshot', {
      outputFile,
      error: errorInfo,
      hint: 'check file path and permissions',
    });
  }

  emitSnapshotResultSuccess({
    standalone,
    skillName: 'browser.snapshot storage',
    artifactName: 'snapshot.storage.json',
    outputFile,
  });
  return { success: true, outputFile, storage };
};

// cli entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.storage.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.storage.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotWithCli({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    standalone,
    skillName: 'browser.snapshot storage',
    snapshotFn: snapshotStorage,
  });
}
