import { spawn } from "node:child_process";

/**
 * Opens `url` in the default browser, cross-platform. Each platform's own opener program is
 * invoked with the URL as a single argument (never shell-interpolated), so there is no
 * injection surface even though `url` is built from a locally-configured port.
 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", '""', url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch (cause) {
    console.error(`Could not open a browser automatically (${(cause as Error).message}). Open ${url} yourself.`);
  }
}
