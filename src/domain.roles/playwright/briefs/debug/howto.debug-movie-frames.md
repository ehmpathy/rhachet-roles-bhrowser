# howto.debug-movie-frames

## .what

capture sequential snapshots at each step to create a "movie" of automation flow.

## .why

single snapshots show one moment. movie frames show:
- state before each action
- state after each action
- where exactly flow diverged
- what changed between steps

essential for debug of multi-step flows.

## .pattern

```typescript
/**
 * .what = get movie identifier with timestamp fallback if null
 * .why = isolates nullable coalesce + date logic from orchestrator
 */
const asMovieId = (input: { movieId: string | null }): string =>
  input.movieId ?? String(Date.now());

/**
 * .what = capture movie frames at each step of automation flow
 * .why = enables frame-by-frame debug of multi-step workflows
 */
export const action = async (
  // movieId nullable: caller may not have identifier; defaults to timestamp
  input: { email: string; password: string; movieId: string | null },
  context: { page: Page; session: string },
) => {
  // determine snapshot directory via named transformer
  const movieId = asMovieId({ movieId: input.movieId });
  const snapshotDir = `.cache/browser.${context.session}/movie.${movieId}`;

  const frame = async (input: { name: string }) => {
    // capture state at this moment
    await context.page.screenshot({ path: `${snapshotDir}/${input.name}.png` });
    const html = await context.page.content();
    await fs.writeFile(`${snapshotDir}/${input.name}.html`, html);
    const url = context.page.url();
    await fs.writeFile(`${snapshotDir}/${input.name}.url`, url);
  };

  // frame 0: initial state
  await frame({ name: '00-initial' });

  // action 1
  await context.page.fill('#email', input.email);
  await frame({ name: '01-email-filled' });

  // action 2
  await context.page.fill('#password', input.password);
  await frame({ name: '02-password-filled' });

  // action 3
  await context.page.click('#submit');
  await frame({ name: '03-submit-clicked' });

  // wait for result
  await context.page.waitForURL('**/dashboard');
  await frame({ name: '04-dashboard-loaded' });
};
```

## .output structure

```
.cache/browser.$SESSION/movie.$TIMESTAMP/
├── 00-initial.png
├── 00-initial.html
├── 00-initial.url
├── 01-email-filled.png
├── 01-email-filled.html
├── 01-email-filled.url
├── 02-password-filled.png
├── 02-password-filled.html
├── 02-password-filled.url
├── 03-submit-clicked.png
├── 03-submit-clicked.html
├── 03-submit-clicked.url
├── 04-dashboard-loaded.png
├── 04-dashboard-loaded.html
└── 04-dashboard-loaded.url
```

## .debug workflow

```
flow failed at step 3
  │
  ├─> open 02-password-filled.png
  │   └─ "password field filled correctly"
  │
  ├─> open 03-submit-clicked.png
  │   └─ "error: submit button was disabled!"
  │
  └─> root cause: validation error not visible in 02
      └─ check 02-password-filled.html for error message
```

## .frame helper

```typescript
/**
 * .what = format frame number as zero-padded prefix
 * .why = ensures consistent two-digit frame numbers for sort order
 */
const asFramePrefix = (input: { numFrame: number }): string =>
  String(input.numFrame).padStart(2, '0');

/**
 * .what = persist single frame snapshot with explicit sequence number
 * .why = pure function for frame capture; caller manages sequence
 */
const setFrameSnapshot = async (
  input: { label: string; numFrame: number },
  context: { page: Page; dir: string },
): Promise<string> => {
  // format frame name with sequence prefix
  const prefix = asFramePrefix({ numFrame: input.numFrame });
  const name = `${prefix}-${input.label}`;

  // capture screenshot
  await context.page.screenshot({ path: `${context.dir}/${name}.png`, fullPage: true });

  // capture html content
  await fs.writeFile(`${context.dir}/${name}.html`, await context.page.content());

  // capture metadata
  await fs.writeFile(`${context.dir}/${name}.meta.json`, JSON.stringify({
    url: context.page.url(),
    title: await context.page.title(),
    time: new Date().toJSON(),
  }, null, 2));

  return name;
};

// usage in playbook
/**
 * .what = example playbook with frame capture at each step
 * .why = demonstrates movie frame debug pattern in practice
 */
export const action = async (
  // movieId nullable: caller may not have identifier; defaults to timestamp
  input: { movieId: string | null },
  context: { page: Page },
) => {
  // frame capture context via named transformer (immutable per frame)
  const movieId = asMovieId({ movieId: input.movieId });
  const frameContext = { page: context.page, dir: `.cache/movie.${movieId}` };

  // capture frames with explicit sequence numbers
  await setFrameSnapshot({ label: 'initial', numFrame: 0 }, frameContext);
  await context.page.click('#start');
  await setFrameSnapshot({ label: 'started', numFrame: 1 }, frameContext);
  // ...
};
```

## .comparison tools

```bash
# view frames in sequence
ls -la .cache/browser.$SESSION/movie.*/

# compare two frames
diff 02-before.html 03-after.html

# image diff (requires imagemagick)
compare 02-before.png 03-after.png diff.png
```

## .see also

- `howto.capture-state-on-error.md` — error state capture
- `howto.browser-diagnosis.md` — diagnosis workflow
