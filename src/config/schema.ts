import { z } from "zod";

/**
 * One `{ provider, query }` pair, deliberately mirroring a butchr rule's own
 * `resourceProvider` + `query` fields (see butchr's docs/rules.example.json).
 */
export const QuerySchema = z.object({
  provider: z.string().min(1, "provider must be a non-empty string"),
  query: z.string().min(1, "query must be a non-empty string"),
});
export type Query = z.infer<typeof QuerySchema>;

/** One butchr user: a single butchr daemon identity with its own queries. */
export const UserSchema = z.object({
  id: z.string().min(1, "id must be a non-empty string"),
  displayName: z.string().min(1, "displayName must be a non-empty string"),
  queries: z.array(QuerySchema).min(1, "queries must contain at least one entry"),
});
export type User = z.infer<typeof UserSchema>;

/**
 * seer's own config file. `port` is the HTTP port the viewer binds; there is
 * deliberately no `host` field — seer always binds its viewer to loopback
 * (decision 4, FACTORY-841 DECISIONS comment), so nothing in this schema can
 * express a non-loopback bind.
 */
export const SeerConfigSchema = z
  .object({
    users: z.array(UserSchema).min(1, "users must contain at least one entry"),
    linkDepth: z.number().int().min(0).default(1),
    refreshIntervalSeconds: z.number().int().min(1).default(60),
    port: z.number().int().min(1).max(65535),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const [index, user] of config.users.entries()) {
      if (seen.has(user.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["users", index, "id"],
          message: `duplicate user id "${user.id}" — user ids must be unique`,
        });
      }
      seen.add(user.id);
    }
  });

export type SeerConfig = z.infer<typeof SeerConfigSchema>;
