# rule.require.grep-html-before-selector-guess

## .what

search the html snapshot before you guess selectors.

## .why

guessed selectors fail because:
- class names differ from what you expect
- IDs are dynamically generated
- structure changed since you last saw it
- framework adds wrapper elements

the html snapshot is the source of truth.

## .pattern

```bash
# 1. capture snapshot
browser.snapshot --session $SESSION --focused

# 2. read the html
cat .cache/browser.$SESSION/snapshot.*/snapshot.html

# 3. search for your target
grep -i "submit" .cache/browser.$SESSION/snapshot.*/snapshot.html
grep -i "button" .cache/browser.$SESSION/snapshot.*/snapshot.html
grep -i "login" .cache/browser.$SESSION/snapshot.*/snapshot.html
```

## .selector discovery

| look for | grep pattern |
|----------|--------------|
| button text | `grep -i "sign in"` |
| input placeholder | `grep -i "placeholder"` |
| form action | `grep -i "action="` |
| data attributes | `grep "data-test"` |
| aria labels | `grep "aria-label"` |

## .examples

### good: search first

```bash
# find the login button
grep -i "sign in\|login\|submit" snapshot.html
# output: <button data-test="login-btn" class="xyz123">Sign In</button>

# use the stable selector
page.click('[data-test="login-btn"]')
```

### bad: guess selector

```bash
# 🚫 guess based on common patterns
page.click('#login')  # not found
page.click('.login-button')  # wrong class
page.click('button[type="submit"]')  # multiple matches
```

## .selector preference order

| priority | selector type | why |
|----------|---------------|-----|
| 1 | `data-test="..."` | stable, for test |
| 2 | `aria-label="..."` | semantic, stable |
| 3 | `[role="..."]` | semantic |
| 4 | unique text | `text="Sign In"` |
| 5 | id | may be dynamic |
| 6 | class | often minified/dynamic |

## .enforcement

guessed selector without search of html = blocker

## .see also

- `rule.require.snapshot-before-assume.md` — snapshot first
- `browser.snapshot html` — capture html
