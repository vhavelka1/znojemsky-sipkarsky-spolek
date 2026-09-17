export function isDevAdminEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_ADMIN === "true";
}

export function isDevelopmentRuntime() {
  return process.env.NODE_ENV === "development";
}
