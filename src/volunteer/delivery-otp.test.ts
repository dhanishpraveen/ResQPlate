import { describe, expect, it } from "vitest";
import {
  decryptDeliveryOtp,
  encryptDeliveryOtp,
  generateNumericOtp,
  hashDeliveryOtp,
  otpResultHttpStatus,
  otpResultMessage,
} from "../../supabase/functions/_shared/delivery-otp";
import { canManageNgoDeliveryOtp } from "../../supabase/functions/_shared/delivery-otp-authorization";
import {
  deliveryOtpCorsHeaders,
  deliveryOtpPreflightResponse,
  deliveryOtpResponse,
} from "../../supabase/functions/_shared/cors";
import { deliveryOtpConfigurationError } from "../../supabase/functions/_shared/delivery-otp-config";
import otpMigration from "../../supabase/migrations/20261029233000_secure_delivery_otp.sql?raw";
import inAppOtpMigration from "../../supabase/migrations/20261030000000_ngo_in_app_delivery_otp.sql?raw";
import unverifiedNgoOtpMigration from "../../supabase/migrations/20261030005600_ngo_delivery_otp_unverified_access.sql?raw";
import unverifiedIssueOtpMigration from "../../supabase/migrations/20261030012700_allow_unverified_ngo_delivery_otp.sql?raw";
import unverifiedVerifyOtpMigration from "../../supabase/migrations/20261030014000_allow_unverified_ngo_delivery_otp_verification.sql?raw";
import qualifiedVerifyOtpMigration from "../../supabase/migrations/20261030015300_fix_delivery_otp_verification_ambiguity.sql?raw";
import deliveryOtpFunction from "../../supabase/functions/delivery-otp/index.ts?raw";

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

  it("returns successful CORS preflight before handler authentication", async () => {
    const preflight = deliveryOtpPreflightResponse("http://127.0.0.1:5173");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("apikey");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("content-type");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("x-client-info");
    expect(await preflight.text()).toBe("");
  });

  it("applies the same CORS headers to configuration error responses", async () => {
    const options = deliveryOtpPreflightResponse("http://localhost:5173");
    const failure = deliveryOtpResponse(
      { error: "server not configured" },
      503,
      "http://localhost:5173",
    );
    expect(failure.status).toBe(503);
    for (const header of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Methods",
      "Access-Control-Max-Age",
      "Vary",
    ]) {
      expect(failure.headers.get(header)).toBe(options.headers.get(header));
    }
  });

  it("requires Supabase backend settings and the HMAC secret but no SMS provider", () => {
    expect(deliveryOtpConfigurationError({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      DELIVERY_OTP_HMAC_SECRET: "short",
    })).toContain("DELIVERY_OTP_HMAC_SECRET (minimum 32 characters)");
    expect(deliveryOtpConfigurationError({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      DELIVERY_OTP_HMAC_SECRET: "a".repeat(32),
    })).toBeNull();
  });

  it("generates four numeric digits using Web Crypto", () => {
    expect(generateNumericOtp()).toMatch(/^\d{4}$/);
  });

  it("allows an unverified NGO to manage its own request code but denies unrelated accounts", () => {
    expect(canManageNgoDeliveryOtp("ngo", "ngo-a", "ngo-a")).toBe(true);
    expect(canManageNgoDeliveryOtp("ngo", "ngo-a", "ngo-b")).toBe(false);
    expect(canManageNgoDeliveryOtp("volunteer", "ngo-a", "ngo-a")).toBe(false);
    expect(deliveryOtpFunction).toContain("canManageNgoDeliveryOtp(role, ngoId, data.ngo_id)");
    expect(deliveryOtpFunction).not.toContain("A verified organization is required");
    expect(deliveryOtpFunction).not.toContain('.select("verification_status")');
  });

  it("hashes the code with its request, volunteer, and NGO bindings", async () => {
    const secret = "a".repeat(32);
    const hash = await hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-a", "0123");

    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-a", "0123")).resolves.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-b", "volunteer-a", "ngo-a", "0123")).resolves.not.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-b", "ngo-a", "0123")).resolves.not.toBe(hash);
    await expect(hashDeliveryOtp(secret, "request-a", "volunteer-a", "ngo-b", "0123")).resolves.not.toBe(hash);
  });

  it("rejects insecure configuration and malformed codes", async () => {
    await expect(hashDeliveryOtp("short", "r", "v", "n", "0123")).rejects.toThrow("at least 32 characters");
    await expect(hashDeliveryOtp("a".repeat(32), "r", "v", "n", "12345")).rejects.toThrow("four digits");
  });

  it("encrypts the in-app code at rest and decrypts it only with the request and NGO binding", async () => {
    const secret = "a".repeat(32);
    const encrypted = await encryptDeliveryOtp(secret, "request-a", "ngo-a", "0042");
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(encrypted).not.toContain("0042");
    await expect(decryptDeliveryOtp(secret, "request-a", "ngo-a", encrypted)).resolves.toBe("0042");
    await expect(decryptDeliveryOtp(secret, "request-b", "ngo-a", encrypted)).rejects.toThrow();
    await expect(decryptDeliveryOtp(secret, "request-a", "ngo-b", encrypted)).rejects.toThrow();
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
    expect(inAppOtpMigration).toContain("add column otp_encrypted text");
    expect(inAppOtpMigration).toContain("new.otp_encrypted := null");
    expect(inAppOtpMigration).toContain("create trigger delivery_otp_clear_ciphertext_after_use");
    expect(inAppOtpMigration).toContain("create function public.issue_delivery_otp_for_ngo");
    expect(inAppOtpMigration).toContain("p.role = 'ngo'");
    expect(inAppOtpMigration).toContain("r.ngo_id = p_ngo_owner_id");
    expect(inAppOtpMigration).toContain("grant execute on function public.issue_delivery_otp_for_ngo");
    const issueFunctionStart = inAppOtpMigration.indexOf("create function public.issue_delivery_otp_for_ngo");
    const issueFunction = inAppOtpMigration.slice(issueFunctionStart);
    expect(issueFunction).not.toContain("verification_status");
    expect(unverifiedNgoOtpMigration).toContain("create or replace function public.issue_delivery_otp_for_ngo");
    expect(unverifiedNgoOtpMigration).toContain("p.role = 'ngo'");
    expect(unverifiedNgoOtpMigration).toContain("r.ngo_id = p_ngo_owner_id");
    expect(unverifiedNgoOtpMigration).not.toContain("verification_status");
    expect(unverifiedIssueOtpMigration).toContain("create or replace function public.issue_delivery_otp(");
    expect(unverifiedIssueOtpMigration).toContain("assigned_volunteer_id is distinct from p_volunteer_id");
    expect(unverifiedIssueOtpMigration).toContain("request_status <> 'picked_up'");
    expect(unverifiedIssueOtpMigration).toContain("donation_status <> 'picked_up'");
    expect(unverifiedIssueOtpMigration).toContain("where h.pickup_request_id = p_request_id");
    expect(unverifiedIssueOtpMigration).not.toContain("np.verification_status = 'verified'");
    expect(unverifiedIssueOtpMigration).toContain("where np.id = request_ngo_id");
  });

  it("allows valid verification for an unverified NGO while preserving volunteer and challenge guards", () => {
    const oldVerifyStart = otpMigration.indexOf("create function public.verify_delivery_otp(");
    const oldVerifyFunction = otpMigration.slice(oldVerifyStart);
    expect(oldVerifyFunction).toContain("np.verification_status = 'verified'");
    expect(oldVerifyFunction).toContain("if not found then return 'not_ready'; end if;");

    expect(unverifiedVerifyOtpMigration).toContain("create or replace function public.verify_delivery_otp(");
    expect(unverifiedVerifyOtpMigration).not.toContain("np.verification_status = 'verified'");
    expect(unverifiedVerifyOtpMigration).toContain("assigned_volunteer_id is distinct from p_volunteer_id");
    expect(unverifiedVerifyOtpMigration).toContain("vp.onboarding_complete");
    expect(unverifiedVerifyOtpMigration).toContain("verification_status <> 'pending'");
    expect(unverifiedVerifyOtpMigration).toContain("where np.id = request_ngo_id");
    expect(unverifiedVerifyOtpMigration).toContain("c.volunteer_id = p_volunteer_id");
    expect(unverifiedVerifyOtpMigration).toContain("if p_now >= challenge_expiry then return 'expired'");
    expect(unverifiedVerifyOtpMigration).toContain("if attempts >= 5 then return 'too_many_attempts'");
    expect(unverifiedVerifyOtpMigration).toContain("if hash_difference <> 0 then");
    expect(unverifiedVerifyOtpMigration).toContain("set volunteer_delivered_at = p_now");
    expect(unverifiedVerifyOtpMigration).toContain("return 'verified'");
    expect(unverifiedVerifyOtpMigration).toContain("grant execute on function public.verify_delivery_otp");
  });

  it("qualifies challenge columns that collide with PL/pgSQL variables", () => {
    expect(qualifiedVerifyOtpMigration).toContain("update public.delivery_otp_challenges c");
    expect(qualifiedVerifyOtpMigration).toContain("and c.verified_at is null");
    expect(qualifiedVerifyOtpMigration).toContain("and c.used_at is null");
    expect(qualifiedVerifyOtpMigration).toContain("set attempt_count = c.attempt_count + 1");
    expect(qualifiedVerifyOtpMigration).toContain("return 'verified'");
    expect(qualifiedVerifyOtpMigration).not.toContain("np.verification_status = 'verified'");
  });
});
