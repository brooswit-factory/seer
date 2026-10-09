bump: minor

### Added
- `SEER_CONFIG` env var and a `--config <path>` flag for both `seer` (serve) and `seer collect`, taking precedence over the previously hardcoded `fixtures/seer.config.example.json` default (`--config` > `SEER_CONFIG` > collect's own positional `[config]` arg > default). An explicitly named path that can't be read or parsed now fails loudly with a `ConfigError` instead of silently falling back to the example config; the untouched default still falls back to fixture-only mode on failure, as before.
