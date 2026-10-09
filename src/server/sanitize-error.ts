/**
 * Builds an error sanitiser for the live `/graph.json` path (FACTORY-875): a Jira client error
 * can echo the request URL, an auth header, or response body text, any of which may contain the
 * credential values this process was given. Every error that could reach a response body or a
 * log line goes through this first, never the raw `Error#message`.
 */
export function createSanitizeError(secrets: string[]): (cause: unknown) => string {
  const nonEmptySecrets = secrets.filter((secret) => secret.length > 0);

  return (cause: unknown): string => {
    let message = cause instanceof Error ? cause.message : String(cause);
    for (const secret of nonEmptySecrets) {
      message = message.split(secret).join("[redacted]");
    }
    // Defensive, beyond the known secrets above: a Basic auth header is the base64 of
    // `email:apiToken` and would not textually match either secret on its own.
    message = message.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]");
    message = message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
    return message.slice(0, 500);
  };
}
