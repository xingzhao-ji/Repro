# Your local web app: supported scope

This page states exactly what Repro 0.2.0 supports when it turns a bug in your own application into REPRO.md, and what it does not. The design is recorded in [ADR 0005](adr/0005-local-app-repro-report.md).

## Supported apps

| Supported | Not supported |
| --- | --- |
| A web app you own or are authorized to test, served over HTTP on this machine (`127.0.0.1`, `localhost` or `::1`) | Production, staging or other remote sites. A URL that is not local is refused |
| Started by an npm, pnpm, yarn or bun script, by a command you give, by `repro.config.json`, or as static files with an `index.html` | Apps that need manual interactive setup, such as a login prompt in the terminal, before they serve HTTP |
| Any frontend framework, or none, rendered in Chromium | Other browsers, mobile apps, native windows, browser extensions |
| Server-side state held by the app process. Repro restarts the app before every run | State in databases, files or services outside the app process. Repro does not reset it |
| Local helper servers on other loopback ports, such as an API or HMR websocket | Requests to any non-local host. They are blocked and listed in the report, never mocked |
| Login with test credentials typed in the steps. Repro withholds the values from the report | Real accounts, SSO, CAPTCHAs, cookies or sessions imported from your own browser |
| Git repositories, including a subfolder of a monorepo and uncommitted changes | Exact revisions for folders outside git. The report says the revision is unknown |

Repro runs your start command with your own permissions, after you confirm the command shown. It is a development tool, not a sandbox for untrusted code.

## How Repro finds out how to start the app

Repro uses the first of these that applies:

1. **The command you enter** in the page or with `--start`.
2. **`repro.config.json`** in the app folder:

   ```json
   {
     "start": "npm run dev -- --port {port}",
     "url": "http://127.0.0.1:{port}/",
     "install": "npm ci",
     "env": { "FEATURE_FLAG": "on" },
     "startTimeoutMs": 60000
   }
   ```

   - `{port}` becomes a free port.
   - `env` holds only non-secret values. Names containing SECRET, TOKEN, PASSWORD, API_KEY or PRIVATE are refused.
   - `"static": "public"` serves a folder with Repro's own read-only file server.

3. **A `package.json` script**: `dev`, then `start`, `serve`, `preview`. The package manager follows the lockfile, or the `packageManager` field.
4. **`index.html`** in the folder, served by Repro's own read-only file server.

Repro sets `PORT` to a free port and `HOST=127.0.0.1`. It then waits for the first local URL the app prints, or for the port it assigned, to answer HTTP.

The guided demonstration (**Show me in a browser instead**) also starts the app, so it asks for the same confirmation first. It opens a visible browser, writes what you do as steps, and adds the element you mark as a check with `(expected value)` in place of its value. Replace that with what the element should show; Repro refuses to run while the placeholder is there, because the page's current value is the wrong one.

You can also give a URL where the app is **already running**. Repro then cannot restart the app between runs, and it cannot prove which source the app serves. The report says so.

Repro never installs dependencies in your folder. If they are missing, it asks you to run the install command yourself. It does run the install command in its own fresh clone when it checks the report.

## Writing the steps (“What went wrong?”)

Write one step per line. Quote what you clicked or typed into, as it appears on the page: its label, placeholder, button text or link text. You can also give a CSS selector such as `"#total"`, or a test id such as `testid:save`.

| You write | Repro does |
| --- | --- |
| `Open the app`, `Go to /cart`, `Reload the page` | Opens or reloads a page of your app |
| `Click "Add to cart"`, `Click the "Save" button`, `Click "Add" 3 times`, `Double-click "Milk"` | Clicks |
| `Type "milk" into "New item"`, `Fill "Quantity" with "2"`, `Clear "Search"` | Fills a field |
| `Press Enter`, `Press Escape in "Search"`, `Press Control+A in "Notes"` | Presses keys |
| `Select "Large" from "Size"`, `Check "Remember me"`, `Uncheck "Remember me"`, `Hover over "Menu"` | Selects, checks or unchecks, hovers |
| `Wait for "Saved"` | Waits until the text is visible |

A list's numbering or bullets, and words like "then", are ignored. A line that is not a step, such as `The counter shows "-1"`, is kept as your note in the report; Repro does not check it.

During the first run, each quoted name is matched to exactly one element on the live page: a role and name, label, placeholder, text, test id, `aria-label` or CSS selector. Repro uses the first rule that finds exactly one element, and REPRO.md records the matched element.

For a step, and only when no element has the exact name, the quoted text may also be part of one button's, link's or other control's name. `Click "Crisp Waffles"` then clicks the only button named, for example, "Crisp Waffles Serves 4 · 30 min". REPRO.md and the test record it as the button whose name contains "Crisp Waffles". Checks always need an exact match.

If a name matches no element or several, Repro asks you to reword the step and lists the controls on the page whose names are closest.

## Saying what should happen (“What should happen?”)

| You write | Check in the test |
| --- | --- |
| `"Total" should show "$8.10"` | the element's visible text equals the value |
| `"#status" should contain "applied"` / `should not contain` | the visible text contains, or does not contain, the value |
| `"Quantity" should have value "2"`, `"Search" should be empty` | the field's value |
| `"Remember me" should be checked` / `unchecked` | the checkbox state |
| `"Saved" should appear` / `should not be visible`, `"Loading" should disappear` | visibility |
| `".todo" should appear 2 times` | how many elements match |
| `I should see "Order placed"`, `The page should not contain "NaN"` | the page's text |
| `The URL should contain "/orders"` | the path of the current URL |
| `There should be no errors` | no uncaught JavaScript errors |

Text comparisons ignore runs of whitespace. Prose without a quoted element and value stays your note. If no check can be built, Repro asks for one; it never invents an expectation.

If Repro cannot find the element a check names, the result says **Needs your input** and lists elements it saw on the page, such as `#remaining shows "0 tasks remaining"`. Choose one and run again.

## What a status means

Every run starts the app again and opens a fresh browser profile.

| Status | Meaning |
| --- | --- |
| **Reproduced** | The capture run and every conclusive repetition (three by default) failed in the same way: the same values for equality checks, the same pass or fail for containment checks |
| **Intermittent** | Some runs failed in the reported way, and others met the expectation or failed differently |
| **Not reproduced** | Every conclusive run met the expectation. The report and test still describe exactly what was tried |
| **Blocked** | Too few runs were conclusive: the app did not start, a step could not be performed, or cleanup was not certified |

Once a failure reproduces, Repro freezes it. A later run that fails differently, for example because a removed step left the page in a different state, is not counted as this bug.

## Shortening the steps

Removing steps is safe only when the expected behavior cannot depend on which steps ran. Take "3 tasks remaining": it means something only after three tasks were added. In a "clicking Add does nothing" bug, the useless click *is* the bug, yet it changes no value, so no observation can show that removing it is harmless. A negative check is no exception: "the total should not show $0.00" is also true of a correct app before anything is added.

Repro therefore shortens steps only in two cases:

- **Every check is `There should be no errors`:** a correct app raises no uncaught error after any sequence of steps.
- **The reporter declares it:** tick *The expected values above stay the same whichever of my steps run* in **More options**, or pass `--steps-independent`. Declare it only when that is true, for example "the page should never show NaN".

In every other case REPRO.md keeps the reported steps. It says why, and lists any steps that did not change a checked value in Repro's runs as *possibly unnecessary, not verified*.

When it does shorten, the search is the same bounded delta-debugging used for the registered cases:

- a trial removes steps;
- it runs the rest twice from a fresh start;
- the change is kept only if both runs show the same frozen failure.

A failure that changes in any way counts as a different failure, not this bug. Repro also records every checked value after each step, and it never removes a step that changed a checked value, or anything such a step depends on.

The default budget is 40 runs (`--budget` accepts 8–120). Shorter steps are confirmed with three more runs before they replace the reported ones. Minimality is claimed only when at least one permitted removal was actually tested, and only among those removals. Global minimality is never claimed.

## The fresh-checkout check

Before writing the final file, Repro follows its own REPRO.md:

1. It clones your repository at the recorded commit into `.repro-runs/…`.
2. It writes the test files with the extraction command from the report.
3. It applies the embedded local-changes patch from the repository root, if there is one.
4. It runs the install command.
5. It installs the test's dependencies.
6. It runs the test.

These are the steps REPRO.md gives the recipient, in the same order. Extraction writes only the four expected names (`<name>.test.mjs`, `package.json`, `package-lock.json` and `local-changes.patch`), and log output in the report is indented so it can never look like a file block.

The report then says whether the test failed in the same way in that clean checkout. If the result differs, the bug depends on something outside the commit and patch: untracked or ignored files, local data, or the environment. The clone is deleted afterwards; its commands and output stay in the report.

## Redaction and withheld values

- **Typed values withheld:** a value typed into a password-like field, or one that looks like a credential, token, card number or personal email, is replaced by an environment variable such as `REPRO_SECRET_1`. The test reads it from the environment, and REPRO.md lists the variable and what it is for, never the value.
- **What is redacted:** logs, the reporter's text, observed values, remote URLs and the local-changes patch. Repro removes:
  - private keys, cloud and SaaS tokens, JWTs, bearer and basic credentials;
  - cookies, and secret-named assignments such as `api_key=…`;
  - URL credentials;
  - emails outside reserved example domains, phone numbers and Luhn-valid card numbers;
  - public IP addresses, your home path, username and hostname.
- **Files left out of the patch:** sensitive files (`.env*`, keys, certificates, `*credentials*`, `*secret*`, `.npmrc` and similar) are listed by name only. So are untracked files that are not source code or configuration, such as notes, logs and data. Binary files, changes with CRLF line endings, and changes over 256 KiB are listed but not embedded.
- **Start command:** an inline `NAME=value` in it, in `repro.config.json` or in a `package.json` script, whose name looks like a secret (`*PASSWORD*`, `*TOKEN*`, `*SECRET*`, `*API_KEY*` …), is refused or hidden. Set secrets in your shell; Repro passes your environment to the app and never writes it into the report.
- **Remotes:** a git remote's address is kept, including the plain `git@` user, but a password or token in it is removed.
- **Final scan:** before the file is written, a last pass over the whole document checks for withheld values and unambiguous credentials.

Redaction is a safeguard, not a guarantee. Review REPRO.md before you share it beyond your team. Repro's local evidence folder, `.repro-runs/`, keeps your original request text and is not meant to be shared.

## Limits

- **Browser and settings:** only Chromium 156 (pinned by Playwright 1.64) in headless mode, at 1280×720, en-US, UTC, with a seeded `Math.random`. The page clock is real unless the manifest sets one.
- **Timing-dependent bugs** may come out **Intermittent**, or reproduce only part of the time.
- **Processes:** Repro stops the app's own process group after every run. A process the app detaches into another group or session is not tracked.
- **Platforms:** Windows is not supported; the exported test uses POSIX process groups. Linux was not part of 0.2.0 acceptance.
- **Not supported:** file uploads, drag and drop, iframes from other origins, multiple tabs, and native dialogs other than auto-accepted `alert` and `confirm`.
- **Causes:** Repro shows that and how a failure happens. It does not diagnose causes, and it does not change your code.
