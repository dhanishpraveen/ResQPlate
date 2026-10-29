export type OtpDatabaseResult =
  | "issued"
  | "verified"
  | "invalid"
  | "expired"
  | "too_many_attempts"
  | "already_used"
  | "unauthorized"
  | "not_ready"
  | "rate_limited"
  | "cooldown";

export function isOtpDatabaseResult(value: unknown): value is OtpDatabaseResult {
  return value === "issued"
    || value === "verified"
    || value === "invalid"
    || value === "expired"
    || value === "too_many_attempts"
    || value === "already_used"
    || value === "unauthorized"
    || value === "not_ready"
    || value === "rate_limited"
    || value === "cooldown";
}

export function generateNumericOtp(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(random[0] % 1_000_000).padStart(6, "0");
}

export async function hashDeliveryOtp(
  secret: string,
  requestId: string,
  volunteerId: string,
  ngoId: string,
  otp: string,
): Promise<string> {
  if (secret.length < 32) throw new Error("DELIVERY_OTP_HMAC_SECRET must contain at least 32 characters.");
  if (!/^\d{6}$/.test(otp)) throw new Error("Delivery OTP must contain exactly six digits.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = new TextEncoder().encode(`${requestId}:${volunteerId}:${ngoId}:${otp}`);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function otpResultHttpStatus(result: OtpDatabaseResult): number {
  switch (result) {
    case "issued": return 200;
    case "verified": return 200;
    case "unauthorized": return 403;
    case "rate_limited":
    case "cooldown":
    case "too_many_attempts": return 429;
    case "already_used":
    case "not_ready": return 409;
    case "invalid":
    case "expired": return 400;
  }
}

export function otpResultMessage(result: OtpDatabaseResult): string {
  switch (result) {
    case "issued": return "A verification code has been sent.";
    case "verified": return "Delivery verified.";
    case "invalid": return "The verification code is incorrect.";
    case "expired": return "The verification code has expired. Request a new code.";
    case "too_many_attempts": return "Too many incorrect attempts. Request a new code later.";
    case "already_used": return "This verification code has already been used.";
    case "unauthorized": return "This delivery is not assigned to your volunteer account.";
    case "not_ready": return "This delivery is not ready for verification.";
    case "rate_limited":
    case "cooldown": return "A new code cannot be sent yet. Please wait before trying again.";
  }
}

export async function sendTwilioSms(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  toNumber: string,
  message: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const authorization = btoa(`${accountSid}:${authToken}`);
  const body = new URLSearchParams({ From: fromNumber, To: toNumber, Body: message });
  const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`SMS provider rejected the delivery code (${response.status}).`);
}
