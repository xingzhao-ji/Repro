# Quickstart: one bug, one REPRO.md

Repro runs a bug in your own local web app, confirms that it reproduces, shortens the steps when that is safe, and writes one `REPRO.md`. A teammate or coding agent can use that file to reproduce the bug, fix it, and run the same test to check the fix. Everything runs on your machine. Repro needs no account, AI service or upload, and it does not change your app folder.

## 1. Install Repro (once)

You need Node.js 24 or newer and npm. Repro was tested with Node 26.7.0 on macOS arm64.

```sh
mkdir repro-workspace && cd repro-workspace
npm init -y
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/repro-local-0.2.0.tgz
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.repro-cache/browsers"
npx --no-install playwright install chromium --only-shell
npx --no-install repro doctor
```

Before installing, check the tarball's SHA-256 against the release evidence. [INSTALL](INSTALL.md) has the details.

## 2. Generate a report

Your app must already be installed in its own folder (for example, `npm install` has been run there), and it must be a git repository.

Start the workbench:

```sh
npx --no-install repro serve
```

Open **http://127.0.0.1:4318** (exactly this address). On the page:

1. **Your app.** Paste the app folder, or click **Choose…** on macOS. If the app is already running, you can also enter its local URL. Repro shows how it will start the app (`npm run dev` from `package.json`, for example) and which commit it is on.
2. **What went wrong?** Write your steps one per line, quoting what you clicked or typed into:

   ```text
   Open the app
   Type "Milk" into "Add an item"
   Press Enter
   Check "Mark Milk as bought"
   Click "Delete Milk"
   The counter shows "-1 items left"
   ```

   **What should happen?** Name the element and the value:

   ```text
   "#items-left" should show "0 items left"
   ```

   As you type, the page shows **Repro understood**: the steps and checks Repro will run. Lines that are not steps are kept as your notes.
3. Read **Repro will:**. It lists the exact command, the fresh browser, the blocked non-local network and the fresh-checkout check. Tick the confirmation and click **Generate report**.

Progress appears as it runs, and you can **Cancel** at any time. A cancelled report writes nothing and stops the app and browser that Repro started. When it finishes, preview REPRO.md, then download or copy it.

To try the whole flow first, click **Try it with an example app** on the same page.

The CLI does the same:

```sh
npx --no-install repro report --app /path/to/my-app \
  --went-wrong $'Type "Milk" into "Add an item"\nPress Enter\nCheck "Mark Milk as bought"\nClick "Delete Milk"' \
  --should-happen '"#items-left" should show "0 items left"'
```

It prints what it understood and what it will run, then asks you to confirm; `--yes` confirms without asking. It prints the path of REPRO.md. Use `repro app --app /path/to/my-app` to see how Repro would run your app without running anything.

## 3. Hand it over

Send REPRO.md to a teammate or a coding agent. It contains:

- the status: reproduced, intermittent, not reproduced, or blocked;
- the expected and observed behavior;
- the shortest steps Repro verified;
- the exact commit and any uncommitted changes, as a patch;
- the environment and dependencies;
- sanitized logs;
- a regression test, embedded in the file;
- the commands to create and run that test.

The recipient needs Node.js, npm and access to your repository. They do not need Repro. In the app folder, they run:

```sh
# step 3 of REPRO.md writes .repro/ from the file itself and checks its hashes
(cd .repro && npm ci && npx playwright install chromium --only-shell)
node --test .repro/<name>.test.mjs   # fails now; passes once the bug is fixed
```

## What to read next

- [LOCAL-APPS](LOCAL-APPS.md): exactly which apps are supported, `repro.config.json`, the step and check grammar, redaction and limits.
- [TROUBLESHOOTING](TROUBLESHOOTING.md): what to do when a step is not found, the app does not start, or the fresh-checkout check differs.
- [USAGE](USAGE.md): every command, including the built-in examples and registered cases from 0.1.0.
