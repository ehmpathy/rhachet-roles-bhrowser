/**
 * .what = capture tab metadata (url, title, viewport)
 * .why = enables context for snapshot interpretation, importable by code
 */
import * as fs from 'fs';
import { BadRequestError } from 'helpful-errors';
import type { Page } from 'playwright';

import {
  type ConnectedBrowser,
  emitSnapshotResultSuccess,
  formatErrorWithContext,
  getAbsoluteTabIndex,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  hasCliFlag,
  isExpectedContextError,
  runSnapshotWithCli,
} from './lib/shared';

export interface SnapshotMetaInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
}

export interface TabMeta {
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  timestamp: string;
  tabIndex: number;
  tabCount: number;
}

export interface SnapshotMetaOutput {
  success: boolean;
  outputFile: string;
  meta?: TabMeta;
  error?: string;
}

/**
 * .what = get title with fallback for expected context errors only
 */
const getTitleOrFallback = async (page: Page): Promise<string> => {
  try {
    return await page.title();
  } catch (err) {
    if (!isExpectedContextError({ error: err })) throw err;
    console.error(
      '   │  title unavailable:',
      formatErrorWithContext({ error: err }),
    );
    return '(unavailable)';
  }
};

/**
 * .what = get current timestamp as ISO string
 */
const getCurrentTimestamp = (): string => new Date().toISOString();

/**
 * .what = capture tab metadata
 */
export const snapshotMeta = async (
  input: SnapshotMetaInput,
): Promise<SnapshotMetaOutput> => {
  const { browser, tabIndex, outputFile, standalone } = input;

  const pages = getPagesFromPrimaryContext({ browser });
  const page = getPageAtTabIndex({ pages, tabIndex });
  const pageIndex = getAbsoluteTabIndex({ tabIndex, pageCount: pages.length });

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

  const meta: TabMeta = {
    url: page.url(),
    title: await getTitleOrFallback(page),
    viewport: page.viewportSize(),
    timestamp: getCurrentTimestamp(),
    tabIndex: pageIndex,
    tabCount: pages.length,
  };

  fs.writeFileSync(outputFile, JSON.stringify(meta, null, 2));

  emitSnapshotResultSuccess({
    standalone,
    skillName: 'browser.snapshot meta',
    artifactName: 'snapshot.meta.json',
    outputFile,
  });

  return { success: true, outputFile, meta };
};

// cli entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.meta.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.meta.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotWithCli({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    standalone,
    skillName: 'browser.snapshot meta',
    snapshotFn: snapshotMeta,
  });
}
