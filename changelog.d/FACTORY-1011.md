bump: major

### BREAKING
- Removed the `admissionWithheld` boolean from the public graph-node schema and provider-match type. Collectors no longer emit it; parsing older graph snapshots ignores the retired field.

### Removed
- Removed `admission:withheld` Jira-label handling and its graph overlay, legend, and styling. Existing Jira labels are ignored without modifying Jira issues.
- Removed the retired field from committed graph fixtures and current schema documentation.

### Fixed
- Preserved the selection halo's existing 22px gap while removing its dependency on the retired overlay's radius constant. Agent status, Jira status, discovery dots, and selection behavior remain independent.
