import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateNumericOtp,
  hashDeliveryOtp,
  isOtpDatabaseResult,
  otpResultHttpStatus,
  otpResultMessage,
  sendTwilioSms,
} from "../_shared/delivery-otp.ts";
import { deliveryOtpCorsHeaders } from "../_shared/cors.ts";

class DeliveryOtpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    headers: { ...deliveryOtpCorsHeaders(origin, configuredOrigins()), "Content-Type": "application/json" },
    status,
  });
}

function configuredOrigins() {
  return (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function configuration() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const otpSecret = Deno.env.get("DELIVERY_OTP_HMAC_SECRET");
  const smsProvider = Deno.env.get("SMS_PROVIDER");
  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!url || !anonKey || !serviceRoleKey || !otpSecret || otpSecret.length < 32) {
    return { error: "Delivery verification is not configured on the server." } as const;
  }
  if (
    smsProvider !== "twilio"
    || !twilioAccountSid
    || !twilioAuthToken
    || !twilioFromNumber
  ) {
    return { error: "SMS delivery is not configured. Contact the application administrator." } as const;
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
    otpSecret,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
  } as const;
}

async function getAssignedRequest(admin: ReturnType<typeof createClient>, requestId: string, volunteerId: string) {
  const { data, error } = await admin
    .from("pickup_requests")
    .select("id, ngo_id, volunteer_id, status, volunteer_picked_up_at, volunteer_delivered_at, delivery_verification_status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("The delivery request could not be loaded.");
  if (!data || data.volunteer_id !== volunteerId) {
    return { error: "This delivery is not assigned to your volunteer account.", status: 403 } as const;
  }
  if (
    data.status !== "picked_up"
    || !data.volunteer_picked_up_at
    || data.delivery_verification_status !== "pending"
    || data.volunteer_delivered_at
  ) {
    return { error: "This delivery is not ready for verification.", status: 409 } as const;
  }
  return { data } as const;
}

async function getNgoVerifiedOwnerPhone(
  admin: ReturnType<typeof createClient>,
  ngoId: string,
) {
  const { data: ngo, error: ngoError } = await admin
    .from("ngo_profiles")
    .select("verification_status")
    .eq("id", ngoId)
    .maybeSingle();
  if (ngoError) throw new Error("The receiving organization could not be verified.");
  if (!ngo || ngo.verification_status !== "verified") {
    throw new DeliveryOtpError("The receiving organization must be verified before delivery confirmation.", 409);
  }

  const { data, error } = await admin.auth.admin.getUserById(ngoId);
  if (error || !data.user) throw new Error("The verified organization owner account could not be loaded.");
  const owner = data.user;
  if (
    !owner.phone
    || !owner.phone_confirmed_at
    || !/^\+[1-9][0-9]{7,14}$/.test(owner.phone)
  ) {
    throw new DeliveryOtpError("The organization owner does not have a verified mobile number.", 409);
  }
  return owner.phone;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const respond = (body: unknown, status = 200) => response(body, status, origin);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: deliveryOtpCorsHeaders(origin, configuredOrigins()),
    });
  }
  if (origin && !new Headers(deliveryOtpCorsHeaders(origin, configuredOrigins())).has("Access-Control-Allow-Origin")) {
    return respond({ error: "This application origin is not allowed." }, 403);
  }
  if (request.method !== "POST") return respond({ error: "Only POST is supported." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond({ error: "Authentication is required." }, 401);

  const config = configuration();
  if ("error" in config) return respond({ error: config.error }, 503);

  const userClient = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return respond({ error: "Authentication could not be verified." }, 401);

  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) return respond({ error: "Volunteer authorization could not be verified." }, 500);
  if (profile?.role !== "volunteer") return respond({ error: "A volunteer account is required." }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return respond({ error: "A JSON request body is required." }, 400);
    body = parsed;
  } catch {
    return respond({ error: "The request body must be valid JSON." }, 400);
  }

  if (!isUuid(body.request_id)) return respond({ error: "A valid request ID is required." }, 400);
  if (body.action !== "send" && body.action !== "verify") {
    return respond({ error: "Choose a supported delivery verification action." }, 400);
  }

  try {
    const assigned = await getAssignedRequest(admin, body.request_id, authData.user.id);
    if ("error" in assigned) return respond({ error: assigned.error }, assigned.status);

    if (body.action === "send") {
      const toNumber = await getNgoVerifiedOwnerPhone(admin, assigned.data.ngo_id);
      const otp = generateNumericOtp();
      const otpHash = await hashDeliveryOtp(
        config.otpSecret,
        body.request_id,
        authData.user.id,
        assigned.data.ngo_id,
        otp,
      );
      const now = new Date();
      const { data: issueResult, error: issueError } = await admin.rpc("issue_delivery_otp", {
        p_request_id: body.request_id,
        p_volunteer_id: authData.user.id,
        p_otp_hash: otpHash,
        p_expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        p_now: now.toISOString(),
      });
      if (issueError) return respond({ error: "The verification code could not be issued." }, 500);
      if (!isOtpDatabaseResult(issueResult)) {
        return respond({ error: "The verification service returned an invalid result." }, 500);
      }
      if (issueResult !== "issued") {
        return respond({ error: otpResultMessage(issueResult) }, otpResultHttpStatus(issueResult));
      }

      try {
        await sendTwilioSms(
          config.twilioAccountSid,
          config.twilioAuthToken,
          config.twilioFromNumber,
          toNumber,
          `ResQPlate delivery verification code: ${otp}. It expires in 10 minutes. Do not share it with anyone other than the volunteer at handover.`,
        );
      } catch {
        return respond({ error: "The SMS provider could not deliver the code. Wait before requesting another code." }, 502);
      }
      return respond({ ok: true });
    }

    if (typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) {
      return respond({ error: "Enter the six-digit NGO verification code." }, 400);
    }
    const otpHash = await hashDeliveryOtp(
      config.otpSecret,
      body.request_id,
      authData.user.id,
      assigned.data.ngo_id,
      body.otp,
    );
    const { data: verificationResult, error: verificationError } = await admin.rpc("verify_delivery_otp", {
      p_request_id: body.request_id,
      p_volunteer_id: authData.user.id,
      p_otp_hash: otpHash,
      p_now: new Date().toISOString(),
    });
    if (verificationError) return respond({ error: "The delivery code could not be verified." }, 500);
    if (!isOtpDatabaseResult(verificationResult)) {
      return respond({ error: "The verification service returned an invalid result." }, 500);
    }
    if (verificationResult !== "verified") {
      return respond({ error: otpResultMessage(verificationResult) }, otpResultHttpStatus(verificationResult));
    }
    return respond({ ok: true });
  } catch (error) {
    if (error instanceof DeliveryOtpError) return respond({ error: error.message }, error.status);
    return respond({ error: "Delivery verification could not be completed." }, 500);
  }
});
