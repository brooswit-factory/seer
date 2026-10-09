// Classifies a graph-JSON QueryRecord into one of four UI-visible states. This is the ONE
// place that decision lives, loaded directly by the browser and imported as-is by
// test/query-status.test.ts.
//
// The honesty requirement this exists for (FACTORY-855 item 7): a query that FAILED must be
// visibly distinguishable from one that matched NOTHING. `error` set wins over `truncated`
// wins over a plain zero-match, so a capped-but-failed query is never read as merely truncated.

/** @returns {"failed"|"truncated"|"zero-match"|"ok"} */
export function classifyQueryRecord(record) {
  if (record.error != null) return "failed";
  if (record.truncated) return "truncated";
  if (record.matched === 0) return "zero-match";
  return "ok";
}

export function queryStatusLabel(record) {
  switch (classifyQueryRecord(record)) {
    case "failed":
      return `failed: ${record.error}`;
    case "truncated":
      return `truncated at ${record.matched} (more results exist)`;
    case "zero-match":
      return "matched nothing";
    case "ok":
      return `matched ${record.matched}`;
  }
}
