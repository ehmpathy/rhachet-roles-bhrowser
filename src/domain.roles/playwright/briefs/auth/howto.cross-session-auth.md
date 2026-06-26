# howto.cross-session-auth

## .what

persist authentication across browser sessions via playwright's `storageState`.

## .why

- human solves captcha once, robot reuses auth indefinitely
- login flows run once per credential lifetime
- headful ↔ headless handoff without re-authentication

## .pattern

### save session after authentication

```typescript
// after login completes
const storageState = await context.storageState();
await fs.writeFile('./auth-state.json', JSON.stringify(storageState, null, 2));
```

### restore session in new browser

```typescript
// new browser instance, same auth
const context = await browser.newContext({
  storageState: './auth-state.json',
});
// all cookies, localStorage, sessionStorage restored
```

## .storage state contents

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123...",
      "domain": ".example.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://example.com",
      "localStorage": [
        { "name": "authToken", "value": "xyz789..." }
      ]
    }
  ]
}
```

## .workflow: captcha handoff

```bash
# 1. human session (headful)
browser.start --session human --mode HEADFUL
# human navigates to login, solves captcha, authenticates

# 2. export auth state
browser.session get --session human --into ./auth-state.json

# 3. stop human session
browser.stop --session human

# 4. robot session (headless)
browser.start --session robot --mode HEADLESS
browser.session set --session robot --from ./auth-state.json

# 5. robot works with human's auth
browser.action --session robot --play ./scrape-data.play.ts
```

## .credential lifetime

| credential type | typical lifetime | refresh strategy |
|-----------------|------------------|------------------|
| session cookie | hours to days | re-login on expiry |
| jwt token | 15 min to 1 hour | refresh token flow |
| oauth token | varies | refresh endpoint |
| remember-me | weeks to months | periodic re-auth |

## .best practices

### secure storage

```bash
# encrypt at rest
gpg -c ./auth-state.json

# restrict permissions
chmod 600 ./auth-state.json
```

### session isolation

```bash
# different sessions for different accounts
browser.session set --session account-a --from ./auth-a.json
browser.session set --session account-b --from ./auth-b.json
```

### expiry detection

```typescript
import { BadRequestError } from 'helpful-errors';

// in playbook, detect session expiry
export const action = async (input: { page: Page }) => {
  await input.page.goto('https://example.com/dashboard');

  // check if redirected to login
  if (input.page.url().includes('/login')) {
    throw new BadRequestError('session expired', {
      url: input.page.url(),
      hint: 're-authenticate via browser.session set --from @storage',
    });
  }

  // continue with authenticated work
};
```

## .see also

- `stealth/ref.antibot-escalation.md` — when auth alone fails
- `browser.session.sh` — session management skill
