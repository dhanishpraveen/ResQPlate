const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export function deliveryOtpCorsHeaders(
  origin: string | null,
  configuredOrigins: readonly string[] = [],
): HeadersInit {
  const allowedOrigins = new Set([...LOCAL_DEVELOPMENT_ORIGINS, ...configuredOrigins]);
  const allowedOrigin = origin
    ? allowedOrigins.has(origin) ? origin : null
    : "*";

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}
