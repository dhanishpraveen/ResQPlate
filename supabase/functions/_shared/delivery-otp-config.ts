export type DeliveryOtpSettings = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DELIVERY_OTP_HMAC_SECRET?: string;
};

export function deliveryOtpConfigurationError(settings: DeliveryOtpSettings): string | null {
  const missing = [
    !settings.SUPABASE_URL && "SUPABASE_URL",
    !settings.SUPABASE_ANON_KEY && "SUPABASE_ANON_KEY",
    !settings.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    (!settings.DELIVERY_OTP_HMAC_SECRET || settings.DELIVERY_OTP_HMAC_SECRET.length < 32)
      && "DELIVERY_OTP_HMAC_SECRET (minimum 32 characters)",
  ].filter((setting): setting is string => Boolean(setting));

  return missing.length > 0
    ? `Delivery verification is not configured. Missing or invalid server setting(s): ${missing.join(", ")}.`
    : null;
}
