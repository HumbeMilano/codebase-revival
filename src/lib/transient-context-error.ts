type BackendError = {
  status?: unknown;
  httpStatus?: unknown;
  code?: unknown;
  message?: unknown;
};

/** Keep an existing authorized session only across temporary transport/server failures. */
export function isTransientContextError(error: unknown): boolean {
  if (!error) return false;
  const details: BackendError =
    typeof error === "object" ? (error as BackendError) : { message: String(error) };
  const status = Number(details.httpStatus ?? details.status);
  const code = String(details.code ?? "").toUpperCase();
  if (status === 401 || status === 403 || code === "42501" || code === "PGRST301")
    return false;
  if (status >= 500 && status < 600) return true;
  const message = String(details.message ?? "");
  return /failed to fetch|fetch failed|network (?:error|request|connection)|timeout|timed out|bad gateway|gateway timeout|ssl|tls|connection (?:failed|reset|refused|closed)|(?:http|status)\s*(?:50\d|52[25])/i.test(message);
}
