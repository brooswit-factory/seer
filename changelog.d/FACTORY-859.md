bump: minor

### Added
- Initial seer project skeleton: TypeScript + Bun, matching butchr's own stack.
- seer config schema and loader/validator (`src/config`).
- seer graph-JSON schema and validator (`src/graph`).
- A committed, schema-valid example graph fixture (`fixtures/graph.example.json`) and example config (`fixtures/seer.config.example.json`).
- Public export surface at `src/index.ts`.
- GitHub Actions CI (typecheck, test) and the release-gate workflow.
