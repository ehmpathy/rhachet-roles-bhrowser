import { chromium } from 'playwright';
import { given, then, useThen, when } from 'test-fns';

import { describeTabs } from './browser.describe';

/**
 * .what = unit tests for browser.describe edge cases
 *
 * .why = integration tests can't easily trigger the zero-pages path
 *        since browsers always start with at least one page.
 *        this test directly calls describeTabs with a browser
 *        that has had all its pages closed.
 */
describe('browser.describe', () => {
  given('[case1] browser with no pages', () => {
    when('[t0] describeTabs is called', () => {
      const result = useThen('describeTabs returns null', async () => {
        // launch browser directly
        const browser = await chromium.launch({ headless: true });

        // close the default page to get zero pages
        const contexts = browser.contexts();
        for (const context of contexts) {
          const pages = context.pages();
          for (const page of pages) {
            await page.close();
          }
        }

        // .note = deliberate mutation zone: capture stdout for verification
        // we must intercept console.log because describeTabs writes directly to it
        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
          // call describeTabs with the browser that has no pages
          const describeResult = await describeTabs({
            browser: browser as Awaited<
              ReturnType<typeof chromium.connectOverCDP>
            >,
            session: 'test-zero-pages',
          });

          return {
            describeResult,
            output: logs.join('\n'),
          };
        } finally {
          console.log = originalLog;
          await browser.close();
        }
      });

      then('it returns null', () => {
        expect(result.describeResult).toBeNull();
      });

      then('output contains turtle vibe', () => {
        expect(result.output).toContain('🦎 rock solid');
      });

      then('output contains browser.describe header', () => {
        expect(result.output).toContain('📽️ browser.describe');
      });

      then('output contains session name', () => {
        expect(result.output).toContain('session: test-zero-pages');
      });

      then('output indicates no browser contexts found', () => {
        expect(result.output).toContain('no browser contexts found');
      });

      then('output matches snapshot', () => {
        expect(result.output).toMatchSnapshot();
      });
    });
  });
});
