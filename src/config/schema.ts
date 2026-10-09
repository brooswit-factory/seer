import { z } from "zod";

/**
 * One `{ provider, query }` pair, deliberately mirroring a butchr rule's own
 * `resourceProvider` + `query` fields (see butchr's docs/rules.example.json).
 *
 * Unlike a butchr rule, a seer query must name its user explicitly: seer
 * runs every source's queries under its OWN single credential, so
 * `currentUser()` would resolve to seer's own account for every source and
 * silently collapse all bubbles onto one identity. The loader (not this
 * schema) refuses any query containing it.
 */
export const QuerySchema = z.object({
  provider: z.string().min(1, "provider must be a non-empty string"),
  query: z.string().min(1, "query must be a non-empty string"),
});
export type Query = z.infer<typeof QuerySchema>;

/**
 * One (machine, butchr user) pair — one bubble in the graph. `machine` is
 * deliberately an open string, not a closed enum: seer does not know the
 * fleet's machine names ahead of time.
 */
export const SourceSchema = z.object({
  id: z.string().min(1, "id must be a non-empty string"),
  machine: z.string().min(1, "machine must be a non-empty string"),
  user: z.string().min(1, "user must be a non-empty string"),
  displayName: z.string().min(1, "displayName must be a non-empty string"),
  queries: z.array(QuerySchema).min(1, "queries must contain at least one entry"),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * seer's own config file. `port` is the HTTP port the viewer binds; there is
 * deliberately no `host` field — seer always binds its viewer to loopback
 * (decision 4, FACTORY-841 DECISIONS comment), so nothing in this schema can
 * express a non-loopback bind.
 */
export const SeerConfigSchema = z
  .object({
    sources: z.array(SourceSchema).min(1, "sources must contain at least one entry"),
    linkDepth: z.number().int().min(0).default(1),
    port: z.number().int().min(1).max(65535),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const [index, source] of config.sources.entries()) {
      if (seen.has(source.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "id"],
          message: `duplicate source id "${source.id}" — source ids must be unique`,
        });
      }
      seen.add(source.id);
    }
  });

export type SeerConfig = z.infer<typeof SeerConfigSchema>;
