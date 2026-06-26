# howto.browser-byhand-work

## .what

use headful browser for interactive work that requires human intervention.

## .why

some tasks require human:
- captcha challenges
- visual verification
- exploratory navigation
- complex authentication

headful mode lets human and robot collaborate.

## .workflow

### 1. start headful browser

```bash
browser.start --session byhand --mode HEADFUL
```

### 2. human navigates

human uses the visible browser window to:
- complete captcha
- authenticate
- find target content
- verify visual state

### 3. robot observes

```bash
# see current state
browser.describe --session byhand

# snapshot what human sees
browser.snapshot --session byhand --focused
```

### 4. robot continues

```bash
# execute playbook on human-prepared state
browser.action --session byhand --play ./extract-data.play.ts
```

### 5. export auth for headless

```bash
# save session for later headless use
browser.session get --session byhand --into ./auth-state.json

# stop headful
browser.stop --session byhand

# start headless with saved auth
browser.start --session robot --mode HEADLESS
browser.session set --session robot --from ./auth-state.json
```

## .common use cases

### captcha handoff

```bash
# robot opens page
browser.start --session captcha --mode HEADFUL
browser.action --session captcha --play goto-login.play.ts

# human solves captcha, completes login

# robot continues with auth
browser.action --session captcha --play scrape-data.play.ts
browser.session get --session captcha --into ./auth.json
browser.stop --session captcha
```

### visual verification

```bash
# robot does work
browser.start --session verify --mode HEADFUL
browser.action --session verify --play fill-form.play.ts

# human verifies form looks correct

# robot submits
browser.action --session verify --play submit-form.play.ts
```

### exploratory research

```bash
# human explores site structure
browser.start --session explore --mode HEADFUL

# human navigates around

# robot snapshots notable states
browser.snapshot --session explore --focused

# robot extracts selectors for future playbooks
cat .cache/browser.explore/snapshot.*/snapshot.html | grep -i "data-testid"
```

## .tips

### keep terminal visible

run browser commands in a terminal the human can see. this enables:
- human to monitor robot's intent
- human to interrupt if needed
- collaboration on next steps

### snapshot before handoff

```bash
# robot snapshots before human acts
browser.snapshot --session byhand --focused

# human acts

# robot snapshots after human acts
browser.snapshot --session byhand --focused

# compare to see what human did
diff snapshot.before.html snapshot.after.html
```

### timeout awareness

headful browsers stay alive indefinitely:

```bash
# no automatic timeout
browser.start --session byhand --mode HEADFUL

# human can take as long as needed

# explicit stop when done
browser.stop --session byhand
```

## .see also

- `howto.browser-action-playbooks.md` — playbook format
- `auth/howto.cross-session-auth.md` — session export/import
- `stealth/ref.antibot-escalation.md` — when to use headful
