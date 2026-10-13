# HCI research: understanding reduced reproduction evidence

Status, 2026-10-13: research question, design rationale and evaluation plan prepared. The current product supports a single synthetic search-race fixture. No participants have been recruited, no human study has run, and no usability benefit or publication readiness is established. [Independent review](../evidence/HCI-REVIEW.md) separates observed interface properties from hypotheses; the [study protocol](HCI-STUDY-PROTOCOL.md) defines the next evidence needed.

## Question and proposed contribution

**How do developers determine what a reduced reproduction establishes, and can a task-focused interface help them accept supported conclusions while withholding unsupported ones?** The target decision is whether evidence warrants “the original failure reproduced” or “this candidate satisfies the same bounded requirement,” including cases where the correct answer is inconclusive.

The proposed contribution is an interaction design that connects a reduction decision to its changed inputs, unchanged assertion, run evidence and limits, plus an empirical characterization of where developers confuse reproduction, minimality, and fix verification. A reusable set of tasks and scoring rules would support replication. These are candidate contributions, not completed research findings. Delta debugging, replay, progressive disclosure and explicit uncertainty already have substantial prior work; this focused review cannot establish novelty by absence of other papers.

Proposed hypotheses are: fewer unsupported reproduction/fix claims accepted; more accurate explanations of what was retained and what remains unknown; and fewer errors recovering the intended historical evidence. Faster completion and higher self-reported trust are secondary observations, not the definition of success. An interface that makes everyone accept everything would fail the research goal.

## Mental model to make visible

These are separate evidence claims, not a progress bar in which every completed operation proves the next one.

| Claim | Evidence required | Inference to avoid |
| --- | --- | --- |
| Captured | Consented scope, persisted actions/response schedule and provenance | A recording alone proves faithful replay, portability or a fix |
| Reproduced | Intended stale-response observation, completed preconditions, executed frozen assertion and exact run identity | Any crash or failed command is the intended bug |
| Reduced | Accepted changed inputs retain that failure under the declared repetition rule; rejected/inconclusive trials remain inspectable | Fewer actions prove root cause, global minimality, or that every retained action is necessary |
| Candidate checked | Original and candidate execute the same assertion/harness and controlled inputs in fresh state, with distinct app identities | A passing frontend check verifies a mocked backend or every possible patch behavior |
| Exported / portable | Export has its own finalized artifact identity; portability additionally needs an actual supported clean-environment run | A saved directory or matching hash proves execution, author trust or universal portability |

The current scripted **Record** operation also executes the assertion. It may therefore provide both captured and reproduced evidence. The reader must inspect the behavioral result rather than infer it from the operation name or lifecycle label. Cancellation, missing evidence and INCONCLUSIVE retain their own meanings. A retained step is only *retained* unless a valid deletion experiment supports a stronger claim.

## Proposed interaction, grounded in the task

Use three working questions: **Establish failure → Reduce steps → Check fix**, with export as an explicit handoff. This is an information hierarchy for investigation, not a requirement to discard the current tested routes or prevent revisiting an earlier run.

1. Keep the selected job and operation, frozen expectation in plain language, behavioral outcome, mock boundary and unresolved limitation visible at the decision point. Qualify lifecycle completion by its operation. Show capture, reduction, candidate and portability claims separately.
2. Make a reduction decision selectable. Its explanation should connect candidate changes, prerequisite closure, actual run IDs, the frozen assertion, observed outcome and the accept/restore reason. Offer rejected attempts through a clearly named disclosure; an inconclusive deletion cannot establish necessity. Do not hide uncertainty in that disclosure.
3. Put full digests, complete manifests and artifact inventories one level deeper, retaining accessible full values and readable export. Show original/candidate observations in aligned fields before raw JSON. Preserve stable selection across navigation and refresh.

The earlier six-section interface provided native disclosures, explicit outcome text, trial decisions and a historical selector. The subsequent HCI increment implements the question sequence, persistent selected-run expectation and connected trial drill-down while retaining those sections. See evidence/RELEASE.md for actual technical checks; comparative fidelity and human comprehension benefits remain unestablished. Avoid a generic dashboard of equal status cards: the investigative decision, rather than the number of metrics, determines prominence. Preserve useful density and the existing restrained visual system.

| Alternative | Benefit | Tradeoff / decision |
| --- | --- | --- |
| Conventional readable logs and JSON | Familiar, portable, complete and easy to audit | Readers must join identities and limits themselves; use a fair searchable version as comparator |
| All evidence expanded together | No disclosure discovery cost | Long identifiers and rejected trials compete with the current decision; keep an expand-all path available in a future prototype |
| Current six-section inspector | Working navigation, provenance and historical selection | Expectation, response order and comparison require cross-view integration; preserve it as the implementation baseline |
| Question sequence with disclosures | Places evidence beside a decision and reduces initial detail | Can hide relevant context or over-direct experts; test discoverability, revisiting and incorrect inferences |

## Related work and limits of transfer

Primary papers/author copies and the W3C standard below were consulted on 2026-10-13. This is a targeted research basis, not a systematic review. The implications are Repro design judgments to test.

| Source | Relevance and bounded implication |
| --- | --- |
| Bettenburg et al., FSE 2008, [What Makes a Good Bug Report?](https://thomas-zimmermann.com/publications/files/bettenburg-fse-2008.pdf) | Their developer/reporter survey identifies a mismatch in available debugging information, including reproduction steps and tests. It motivates the evidence handoff task, but does not establish that Repro reduces developers' effort. |
| Zeller & Hildebrandt, TSE 2002, [Simplifying and Isolating Failure-Inducing Input](https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/delta-debugging.pdf), [DOI](https://doi.org/10.1109/32.988498) | Failure-preserving reduction distinguishes pass, intended failure and unresolved tests; 1-minimality differs from a global minimum. Repro's UI must communicate its actual dependency groups, budgets and inconclusive neighbors. Algorithmic guarantees are not comprehension evidence. |
| Regehr et al., PLDI 2012, [Test-Case Reduction for C Compiler Bugs](https://users.cs.utah.edu/~regehr/papers/pldi12-preprint.pdf) | The paper treats validity and readability as issues beyond output size. Its C-specific transformations do not transfer directly to browser actions. Smaller action counts are consequently a technical measure, not a usability outcome. |
| Ko & Myers, CHI 2004, [Designing the Whyline](https://faculty.washington.edu/ajko/papers/Ko2004Whyline.pdf) | Organizing debugging around questions and relevant runtime evidence motivates the proposed hierarchy. Its Alice setting and small iterative evaluation do not supply an effect size for this developer tool or prove that our disclosures work. |
| Johnson, Brun & Meliou, ICSE 2020, [Causal Testing: Understanding Defects' Root Causes](https://people.cs.umass.edu/brun/pubs/pubs/Johnson20icse.pdf) | Contrasting nearby passing/failing executions can help investigate causes. Repro preserves a failure while reducing inputs and checks a revision; it does not implement this causal-testing method or establish a root cause merely by retaining actions. The linked PDF is the source used; its numerical abstract differs from the author's landing page, so no numerical result is imported here. |
| Wang & LaToza, VL/HCC 2025, [How Omniscient Debuggers Impact Debugging Behavior](https://mason.gmu.edu/~rwang29/assets/pdf/VLHCC25-omniscient-debugging.pdf) | In the studied Replay/Chrome tasks, fewer reruns did not accompany a statistically significant improvement in task success or completion time. Tool/version changes and task familiarity also matter. Repro should measure reasoning and navigation separately from execution counts, and freeze study builds. |
| Lee & See, Human Factors 2004, [Trust in Automation: Designing for Appropriate Reliance](https://doi.org/10.1518/hfes.46.1.50_30392), [original-paper mirror](https://scispace.com/pdf/trust-in-automation-designing-for-appropriate-reliance-2uiy4o89ga.pdf) | This conceptual review connects appropriate reliance to capabilities and context. It motivates distinguishing a developer's attitude, claim confidence and actual acceptance decision. Our task-specific measures are operationalizations, not a validated general trust scale. |
| Poursabzi-Sangdeh et al., CHI 2021, [Manipulating and Measuring Model Interpretability](https://www.jennwv.com/papers/manipulating.pdf) | In their prediction tasks, making a model transparent did not uniformly improve decisions and could impede correction of large errors. This cautions against equating more exposed internals with better calibration. Housing predictions and ML explanations differ materially from reproduction evidence. |
| W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Keyboard access, focus, reflow, text alternatives and distinguishable status are testable requirements. Automated rules and selected screenshots cover only part of them; human understanding and actual assistive-technology use need separate evaluation. |

Before a novelty or generalization claim, extend the review to test-case readability, debugging provenance and developer trust studies; freeze an eligible broader task corpus; and complete the independent human evaluation. Publication venue selection follows the evidence, not this specification.
