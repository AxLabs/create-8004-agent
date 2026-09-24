# Complete Repository Initialization

Follow this procedure only while `AGENTS.md` contains the `AXLABS INITIALIZATION: INCOMPLETE` marker.

1. Inspect the repository evidence before editing instructions. Read the existing `AGENTS.md`, README and documentation, package or build manifests, configuration, source entry points and module boundaries, tests, CI workflows, and deployment or operational files that are present.
2. Update the repository-owned parts of `AGENTS.md` with the durable context a contributor needs repeatedly:
   - what the repository owns and why it exists;
   - its architecture and important paths;
   - constraints and existing decisions that changes must preserve;
   - development, test, build, lint, typecheck, and other validation commands that repository evidence supports;
   - the authoritative project-context repository, when one is documented.
3. Preserve existing repository instructions and documented decisions. Integrate useful context into the existing structure, keep repository-specific content outside `AXLABS MANAGED` blocks, and do not invent facts. Ask the developer only about material information that cannot reasonably be established from repository evidence.
4. Confirm that every command and path you added exists or is supported by repository configuration. Remove placeholder sections that do not apply.
5. Remove the `AXLABS INITIALIZATION: INCOMPLETE` marker from `AGENTS.md`. Leave Bootstrapr-managed blocks and this file unchanged, then run the same Bootstrapr package and version with `check`.

Initialization is complete when the marker is absent, repository-specific guidance is evidence-based and repository-owned, and `bootstrapr check` passes.
