import { describe, expect, it, vi } from "vitest";
import {
  generateNumericOtp,
  hashDeliveryOtp,
  otpResultHttpStatus,
  otpResultMessage,
  sendTwilioSms,
} from "../../supabase/functions/_shared/delivery-otp";
import { deliveryOtpCorsHeaders } from "../../supabase/functions/_shared/cors";
import otpMigration from "../../supabase/migrations/20261029233000_secure_delivery_otp.sql?raw";

describe("delivery OTP server helpers", () => {
  it.each(["http://localhost:5173", "http://127.0.0.1:5173"])("allows local development origin %s with Supabase headers", (origin) => {
    const headers = new Headers(deliveryOtpCorsHeaders(origin));
    expect(headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("authorization");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("apikey");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("content-type");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("x-client-info");
  });

  it("allows configured deployed origins and rejects unknown browser origins", () => {
    expect(new Headers(deliveryOtpCorsHeaders("https://resqplate.example", ["https://resqplate.example"]))
      .get("Access-Control-Allow-Origin")).toBe("https://resqplate.example");
    expect(new Headers(deliveryOtpCorsHeaders("https://untrusted.example"))
      .has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("generates six numeric digits using Web Crypto", () => {
    expect(generateNumericOtp()).toMatch(/^\d{6}$/);
  });

  it("hashes the code with its request, volunteer, and NGO bindings", async () => {
    const secret = "a".repeat(32);
    const hash = await hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-a", "012345");

    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-a", "012345")).resolves.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-b", "volunteer-a", "ngo-a", "012345")).resolves.not.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-b", "ngo-a", "012345")).resolves.not.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-b", "012345")).resolves.not.toBe(hash);
  });

  it("rejects insecure configuration and malformed codes", async () => {
    await expect(hashDeliveryOtp("short", "r", "v", "n", "012345")).rejects.toThrow("at least 32 characters");
    await expect(hashDeliveryOtp("a".repeat(32), "r", "v", "n", "1234")).rejects.toThrow("six digits");
  });

  it.each([
    ["invalid", 400],
    ["expired", 400],
    ["already_used", 409],
    ["too_many_attempts", 429],
    ["unauthorized", 403],
    ["rate_limited", 429],
  ] as const)("maps the backend %s result without exposing challenge data", (result, status) => {
    expect(otpResultHttpStatus(result)).toBe(status);
    expect(otpResultMessage(result)).not.toMatch(/\b\d{6}\b/);
  });

  it("returns no success when the SMS provider rejects a delivery code", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(sendTwilioSms("sid", "token", "+15555550100", "+15555550101", "private OTP", fetcher))
      .rejects.toThrow("SMS provider rejected the delivery code (503)");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("sends the code through the configured provider without returning it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    await expect(sendTwilioSms("sid", "token", "+15555550100", "+15555550101", "message with code", fetcher))
      .resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("keeps OTP state private and enforces request, expiry, attempt, and one-use checks in SQL", () => {
    expect(otpMigration).toContain("enable row level security");
    expect(otpMigration).toContain("revoke all on public.delivery_otp_challenges from public, anon, authenticated");
    expect(otpMigration).toContain("otp_hash text not null");
    expect(otpMigration).toContain("assigned_volunteer_id is distinct from p_volunteer_id");
    expect(otpMigration).toContain("if p_now >= challenge_expiry then return 'expired'");
    expect(otpMigration).toContain("if attempts >= 5 then return 'too_many_attempts'");
    expect(otpMigration).toContain("set attempt_count = attempt_count + 1");
    expect(otpMigration).toContain("if used_at is not null or verified_at is not null then return 'already_used'");
    expect(otpMigration).toContain("for hash_index in 1..64 loop");
    expect(otpMigration).toContain("if hash_difference <> 0 then");
    expect(otpMigration).toContain("and c.ngo_id = request_ngo_id");
    expect(otpMigration).toContain("for update");
    expect(otpMigration).toContain("return 'verified'");
    expect(otpMigration).toContain("set volunteer_delivered_at = p_now");
    expect(otpMigration).toContain("and volunteer_delivered_at is null");
    expect(otpMigration).toContain("revoke all on function public.volunteer_confirm_delivery(uuid)");
  });
});
