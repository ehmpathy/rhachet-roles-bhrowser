# ref.antibot-escalation

## .what

antibot systems escalate detection based on behavioral signals. counter with a tiered approach that matches escalation intensity.

## .tiers

| tier | detection | countermeasure |
|------|-----------|----------------|
| 1 | webdriver flag, headless UA | stealth plugin patches |
| 2 | behavioral fingerprint | headful browser + real viewport |
| 3 | captcha challenge | human fallback session |

## .tier 1: stealth plugin

basic patches hide automation signals:

```typescript
// playwright-extra with stealth plugin
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());
const browser = await chromium.launch();
```

patches applied:
- `navigator.webdriver = false`
- removes `HeadlessChrome` from user-agent
- normalizes chrome object signatures
- fixes webgl renderer strings

## .tier 2: headful mode

when stealth plugin fails:

```bash
# start headful browser
browser.start --session $SESSION --mode HEADFUL

# real viewport, real mouse movements
# some sites require visible window
```

headful enables:
- real gpu render
- visible checkbox clicks (recaptcha v2)
- canvas fingerprint consistency

## .tier 3: human fallback

for sites that require human verification:

```bash
# 1. start headful session
browser.start --session captcha-session --mode HEADFUL

# 2. human completes captcha, logs in

# 3. save auth state
browser.session get --session captcha-session --into ./auth-state.json

# 4. stop headful browser
browser.stop --session captcha-session

# 5. start headless with saved auth
browser.start --session headless-work --mode HEADLESS
browser.session set --session headless-work --from ./auth-state.json

# human solved once, headless reuses auth
```

## .detection signals

| signal | tier 1 fix | tier 2 fix |
|--------|------------|------------|
| `navigator.webdriver` | stealth plugin | headful |
| `HeadlessChrome` in UA | stealth plugin | headful |
| canvas fingerprint | webgl patches | real gpu |
| mouse movements | synthetic events | real mouse |
| captcha checkbox | — | real click |
| behavioral time pattern | add delays | human-like time |

## .escalation flow

```
attempt with tier 1 (stealth)
  │
  ├─ success → continue
  │
  └─ blocked → escalate to tier 2 (headful)
        │
        ├─ success → continue
        │
        └─ captcha → escalate to tier 3 (human)
              │
              └─ save session → switch to headless
```

## .session persistence

critical: save auth state after human verification so headless can reuse it:

```typescript
// after human completes login/captcha
const storageState = await context.storageState();
await writeFile('./auth-state.json', JSON.stringify(storageState));

// later, in headless session
const context = await browser.newContext({
  storageState: './auth-state.json',
});
// cookies, localStorage, sessionStorage all restored
```

## .see also

- `auth/howto.cross-session-auth.md` — session persistence patterns
- `browser.session.sh` — session import/export skill
