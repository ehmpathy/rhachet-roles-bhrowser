/**
 * .what = capture network requests from browser tab
 * .why = enables HAR data for API debug and replay, importable by code
 */
import * as fs from 'fs';
import { BadRequestError, MalfunctionError } from 'helpful-errors';

import {
  type ConnectedBrowser,
  emitSnapshotResultError,
  emitSnapshotResultSuccess,
  formatErrorWithContext,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  hasCliFlag,
  isExpectedContextError,
  runSnapshotWithCli,
} from './lib/shared';

export interface SnapshotNetworkInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
}

export interface ResourceEntry {
  name: string;
  type: string;
  duration: number;
  size: number;
}

export interface NetworkSnapshot {
  note: string;
  url?: string;
  entries: ResourceEntry[];
}

export interface SnapshotNetworkOutput {
  success: boolean;
  outputFile: string;
  network?: NetworkSnapshot;
  error?: string;
}

/**
 * .what = get performance resource entries from page
 * .note = defined as string to avoid bundler __name injection in browser context
 * .note = map/reduce are inside named transformers; further extraction not practical
 *         due to browser eval serialization constraints (code executes in browser, not node)
 */
const getPerformanceResourceEntriesCode = `
  (function() {
    // transformer: check if performance API is available
    function hasPerformanceApi() {
      return typeof performance !== 'undefined' &&
        typeof performance.getEntriesByType === 'function';
    }

    // transformer: format PerformanceResourceTiming to ResourceEntry shape
    // .decode = extracts name, type, duration, size from browser performance entry
    function asResourceEntry(entry) {
      return {
        name: entry.name,
        type: entry.initiatorType,
        duration: entry.duration,
        size: entry.transferSize || 0,
      };
    }

    // transformer: map entries array to resource entry shapes
    // .decode = applies asResourceEntry to each performance entry
    function mapEntriesToResourceEntries(entries) {
      return entries.map(asResourceEntry);
    }

    if (!hasPerformanceApi()) return [];
    return mapEntriesToResourceEntries(
      performance.getEntriesByType('resource')
    );
  })()
`;

/**
 * .what = capture network requests from browser tab
 */
export const snapshotNetwork = async (
  input: SnapshotNetworkInput,
): Promise<SnapshotNetworkOutput> => {
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

  try {
    /**
     * .cast = page.evaluate() at browser boundary
     * .why = playwright's page.evaluate() returns Promise<unknown> by design;
     *        browser-context functions execute in a separate V8 isolate where
     *        typescript types cannot flow.
     * .alternative = none; this is an inherent limitation of browser/node boundary.
     *                runtime validation could be added but would add overhead
     *                for internal code where the function definition is known.
     */
    const entries = (await page.evaluate(
      getPerformanceResourceEntriesCode,
    )) as ResourceEntry[];

    const output: NetworkSnapshot = {
      note: 'captures performance resource entries; for full HAR, use page.routeFromHAR',
      url: page.url(),
      entries,
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    emitSnapshotResultSuccess({
      standalone,
      skillName: 'browser.snapshot network',
      artifactName: 'snapshot.network.json',
      outputFile,
    });

    return { success: true, outputFile, network: output };
  } catch (e) {
    if (!isExpectedContextError({ error: e })) throw e;
    // expected context error: write placeholder, emit error, then throw
    const errorInfo = formatErrorWithContext({ error: e });
    const output: NetworkSnapshot = {
      note: 'network data unavailable: ' + errorInfo,
      entries: [],
    };
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    emitSnapshotResultError({
      standalone,
      skillName: 'browser.snapshot network',
      artifactName: 'snapshot.network.json',
      errorInfo,
    });
    MalfunctionError.throw('network capture failed', {
      outputFile,
      tabIndex,
      errorInfo,
      hint: 'page may have navigated or closed - check placeholder file for details',
      cause: e instanceof Error ? e : undefined,
    });
  }
};

// cli entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.network.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.network.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotWithCli({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    standalone,
    skillName: 'browser.snapshot network',
    snapshotFn: snapshotNetwork,
  });
}
