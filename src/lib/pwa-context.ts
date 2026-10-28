export const HOUSEHOLD_ORIGIN = "https://app.skendal.com";
export const ADMIN_ORIGIN = "https://admin.skendal.com";

export function isAdminHost(hostname: string) {
  return hostname === "admin.skendal.com" || hostname === "admin.localhost";
}

export function applicationContext(url: URL) {
  const admin = isAdminHost(url.hostname);
  const local = ["localhost", "127.0.0.1", "app.localhost", "admin.localhost"].includes(
    url.hostname,
  );
  const suffix = url.port ? `:${url.port}` : "";
  return {
    admin,
    adminOrigin: local ? `${url.protocol}//admin.localhost${suffix}` : ADMIN_ORIGIN,
    householdOrigin: local
      ? admin
        ? `${url.protocol}//app.localhost${suffix}`
        : url.origin
      : HOUSEHOLD_ORIGIN,
  };
}

export const currentApplication = applicationContext(
  new URL(typeof window === "undefined" ? HOUSEHOLD_ORIGIN : window.location.href),
);

// An explicit empty fragment prevents HTTP redirects from inheriting an Auth
// callback fragment. Never carry credentials or arbitrary query strings across.
export function adminEntry(url: URL) {
  const target = new URL(applicationContext(url).adminOrigin + "/");
  const stripe = url.searchParams.get("stripe");
  if (stripe === "success" || stripe === "canceled") target.searchParams.set("stripe", stripe);
  return target.href + "#";
}
