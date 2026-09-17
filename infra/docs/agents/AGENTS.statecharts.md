# statecharts addendum

Runtime-agnostic statechart definitions and their model-based tests. This package is the spec for agent lifecycles, the offline sync machine, and walkthrough tours.

- No imports from Bun, Node, or the DOM. Guards and actions are referenced by name; runtimes bind them. If a definition needs a runtime, it is wrong.
- Every machine ships with model-based tests that walk every reachable path; the tests are the acceptance criteria for any runtime that claims to implement the machine.
- Definitions must stay JSON-serialisable so a Go runtime can interpret them later; no closures in configs.
- Changing a machine's states or transitions is a versioned change with a note on which runtimes must update.
