# task-tally (Repro test fixture)

A deliberately buggy local web app used by Repro's own tests. `npm start` serves it on `$PORT`.
Unchecking a completed task decrements the remaining count again. `fix.patch` is the controlled fix.
The server logs a fake API key and a fake personal email to exercise report redaction.
