type ContextError = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
};

/** A temporary transport failure cannot grant access, but may leave an already
 * authorized, identity-bound view mounted. Explicit denial always takes priority. */
export function isTransientContextError(error: unknown, httpStatus?: number): boolean {
  if (!error) return false;
  const details: ContextError =
    typeof error === "object" ? (error as ContextError) : { message: String(error) };
  const status = Number(httpStatus ?? details.status);
  const code = String(details.code ?? "").toUpperCase();
  const message = String(details.message ?? "");
  if (
    (status >= 400 && status < 500) ||
    /^(42501|PGRST30[123]|BAD_JWT|SESSION_NOT_FOUND|USER_BANNED|USER_NOT_FOUND|REFRESH_TOKEN_NOT_FOUND|REFRESH_TOKEN_ALREADY_USED)$/.test(
      code,
    ) ||
    /suspend|revok|forbidden|permission denied|not authorized|unauthorized|invalid (?:device|session|jwt|token)|(?:jwt|token|session) (?:has )?expired/i.test(
      message,
    )
  )
    return false;
  if (status >= 500 && status < 600) return true;
  return /failed to fetch|fetch failed|network(?:error| error| request| connection)|timeout|timed out|bad gateway|gateway timeout|ssl|tls|connection (?:failed|reset|refused|closed)/i.test(
    message,
  );
}
