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
  const limit = Math.floor(0x1_0000_0000 / 10_000) * 10_000;
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(random[0] % 10_000).padStart(4, "0");
}

export async function hashDeliveryOtp(
  secret: string,
  requestId: string,
  volunteerId: string,
  ngoId: string,
  otp: string,
): Promise<string> {
  if (secret.length < 32) throw new Error("DELIVERY_OTP_HMAC_SECRET must contain at least 32 characters.");
  if (!/^\d{4}$/.test(otp)) throw new Error("Delivery OTP must contain exactly four digits.");
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

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("DELIVERY_OTP_HMAC_SECRET must contain at least 32 characters.");
  const material = new TextEncoder().encode(`ResQPlate delivery OTP encryption:${secret}`);
  const keyBytes = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function encryptDeliveryOtp(
  secret: string,
  requestId: string,
  ngoId: string,
  otp: string,
): Promise<string> {
  if (!/^\d{4}$/.test(otp)) throw new Error("Delivery OTP must contain exactly four digits.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${requestId}:${ngoId}`);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    await encryptionKey(secret),
    new TextEncoder().encode(otp),
  ));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return bytesToBase64(combined);
}

export async function decryptDeliveryOtp(
  secret: string,
  requestId: string,
  ngoId: string,
  encryptedOtp: string,
): Promise<string> {
  const combined = base64ToBytes(encryptedOtp);
  if (combined.length !== 32) throw new Error("Stored delivery code is invalid.");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: combined.slice(0, 12),
      additionalData: new TextEncoder().encode(`${requestId}:${ngoId}`),
    },
    await encryptionKey(secret),
    combined.slice(12),
  );
  const otp = new TextDecoder().decode(decrypted);
  if (!/^\d{4}$/.test(otp)) throw new Error("Stored delivery code is invalid.");
  return otp;
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
    case "issued": return "A delivery verification code is ready.";
    case "verified": return "Delivery verified.";
    case "invalid": return "The verification code is incorrect.";
    case "expired": return "The verification code has expired. Request a new code.";
    case "too_many_attempts": return "Too many incorrect attempts. Request a new code later.";
    case "already_used": return "This verification code has already been used.";
    case "unauthorized": return "This delivery is not assigned to your volunteer account.";
    case "not_ready": return "This delivery is not ready for verification.";
    case "rate_limited":
      return "The delivery code generation limit has been reached. Try again later.";
    case "cooldown": return "A new delivery code can be generated after the 60-second cooldown.";
  }
}
