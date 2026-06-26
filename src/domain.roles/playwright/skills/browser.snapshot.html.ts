/**
 * .what = capture HTML source of browser tab
 * .why = enables DOM state for selector debug, importable by code
 */
import * as fs from 'fs';
import { BadRequestError, MalfunctionError } from 'helpful-errors';
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
  isExpectedContextError,
  runSnapshotWithCli,
} from './lib/shared';

export interface SnapshotHtmlInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
}

export interface SnapshotHtmlOutput {
  success: boolean;
  outputFile: string;
  html?: string;
  error?: string;
}

/**
 * .what = get page content via playwright SDK
 * .why = communicator encapsulates raw page.content() SDK call
 */
const getPageContent = async (input: { page: Page }): Promise<string> =>
  input.page.content();

/**
 * .what = get page outer HTML via evaluate
 * .why = communicator encapsulates raw page.evaluate() SDK call for HTML extraction
 */
const getPageOuterHtml = async (input: { page: Page }): Promise<string> =>
  input.page.evaluate(() => document.documentElement.outerHTML);

/**
 * .what = get page HTML with fallback strategy
 * .note = only handles expected context/navigation errors; rethrows unexpected
 */
const getPageHtmlWithFallback = async (
  page: Page,
): Promise<{ html: string | null; error: unknown }> => {
  // try page.content() first
  try {
    return { html: await getPageContent({ page }), error: null };
  } catch (e) {
    if (!isExpectedContextError({ error: e })) throw e;
    // fallback: grab outerHTML directly via evaluate
    try {
      return { html: await getPageOuterHtml({ page }), error: null };
    } catch (e2) {
      if (!isExpectedContextError({ error: e2 })) throw e2;
      return { html: null, error: e };
    }
  }
};

/**
 * .what = capture HTML source of browser tab
 */
export const snapshotHtml = async (
  input: SnapshotHtmlInput,
): Promise<SnapshotHtmlOutput> => {
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

  // get HTML content with fallback
  const { html, error } = await getPageHtmlWithFallback(page);

  // fallback failed: write placeholder, emit error, then throw
  if (!html) {
    const errorInfo = formatErrorWithContext({ error });
    fs.writeFileSync(
      outputFile,
      '<!-- content unavailable: ' + errorInfo + ' -->',
    );
    emitSnapshotResultError({
      standalone,
      skillName: 'browser.snapshot html',
      artifactName: 'snapshot.html',
      errorInfo,
    });
    MalfunctionError.throw('html capture failed', {
      outputFile,
      tabIndex,
      errorInfo,
      hint: 'page may have navigated or closed - check placeholder file for details',
      cause: error instanceof Error ? error : undefined,
    });
  }

  fs.writeFileSync(outputFile, html);
  emitSnapshotResultSuccess({
    standalone,
    skillName: 'browser.snapshot html',
    artifactName: 'snapshot.html',
    outputFile,
  });
  return { success: true, outputFile, html };
};

// cli entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.html.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.html.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotWithCli({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    standalone,
    skillName: 'browser.snapshot html',
    snapshotFn: snapshotHtml,
  });
}
