# Architecture review before breadth

Given the current implementation, GOAL.md and docs/ARCHITECTURE.md, identify the single supported end-to-end execution path. Trace real data from capture to oracle to reducer to capsule to UI evidence.

Check that changing the candidate app cannot change its assertion or harness. Identify every nondeterministic input and external dependency. Determine whether mocks replace the behavior the candidate fix is supposed to change. Review process ownership, resets, deadlines, cancellation and restart semantics. Find unnecessary layers that obscure these properties.

Return concrete incompatible contracts, unsafe trust crossings and missing tests. For each, cite code or an executable case and propose the smallest repair. Do not approve a design solely because its diagram is attractive or because it lists familiar technologies. No external state changes are authorized by this review.
