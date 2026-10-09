import { GraphSchema, type Graph } from "./schema.ts";

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** The schema-parsed (defaults applied) graph, present only when `valid` is true. */
  data?: Graph;
}

/** Validate an unknown value as a {@link Graph}: schema shape, plus edges referencing existing node ids. */
export function validateGraph(data: unknown): ValidationResult {
  const result = GraphSchema.safeParse(data);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
        message: issue.message,
      })),
    };
  }

  const graph = result.data;
  const errors: ValidationError[] = [];

  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      errors.push({ path: `nodes.${index}.id`, message: `duplicate node id "${node.id}"` });
    }
    nodeIds.add(node.id);
  }

  for (const [index, edge] of graph.edges.entries()) {
    if (!nodeIds.has(edge.source)) {
      errors.push({ path: `edges.${index}.source`, message: `edge references unknown node id "${edge.source}"` });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ path: `edges.${index}.target`, message: `edge references unknown node id "${edge.target}"` });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, errors: [], data: graph };
}

/** Parse and validate, throwing a clear, actionable error naming every offending field path. */
export function parseGraph(data: unknown): Graph {
  const result = validateGraph(data);
  if (!result.valid || result.data === undefined) {
    const lines = result.errors.map((e) => `  - ${e.path}: ${e.message}`);
    throw new Error(`Invalid seer graph:\n${lines.join("\n")}`);
  }
  return result.data;
}
