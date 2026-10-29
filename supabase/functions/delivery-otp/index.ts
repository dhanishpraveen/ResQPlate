import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decryptDeliveryOtp,
  encryptDeliveryOtp,
  generateNumericOtp,
  hashDeliveryOtp,
  isOtpDatabaseResult,
  otpResultHttpStatus,
  otpResultMessage,
} from "../_shared/delivery-otp.ts";
import {
  deliveryOtpCorsHeaders,
  deliveryOtpPreflightResponse,
  deliveryOtpResponse,
} from "../_shared/cors.ts";
import {
  deliveryOtpConfigurationError,
  type DeliveryOtpSettings,
} from "../_shared/delivery-otp-config.ts";
import { canManageNgoDeliveryOtp } from "../_shared/delivery-otp-authorization.ts";

type Role = "ngo" | "volunteer";

class DeliveryOtpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function configuredOrigins() {
  return (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return deliveryOtpResponse(body, status, origin, configuredOrigins());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function configuration() {
  const settings: DeliveryOtpSettings = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    DELIVERY_OTP_HMAC_SECRET: Deno.env.get("DELIVERY_OTP_HMAC_SECRET"),
  };
  const error = deliveryOtpConfigurationError(settings);
  if (error) return { error } as const;
  return {
    url: settings.SUPABASE_URL!,
    anonKey: settings.SUPABASE_ANON_KEY!,
    serviceRoleKey: settings.SUPABASE_SERVICE_ROLE_KEY!,
    otpSecret: settings.DELIVERY_OTP_HMAC_SECRET!,
  } as const;
}

async function getAssignedRequest(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  volunteerId: string,
) {
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

async function getNgoDeliveryRequest(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  ngoId: string,
  role: Role,
) {
  const { data, error } = await admin
    .from("pickup_requests")
    .select("id, ngo_id, volunteer_id, status, volunteer_picked_up_at, volunteer_delivered_at, delivery_verification_status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("The delivery request could not be loaded.");
  if (!data || !canManageNgoDeliveryOtp(role, ngoId, data.ngo_id)) {
    throw new DeliveryOtpError("This delivery does not belong to your organization.", 403);
  }
  if (data.status !== "picked_up"
    || !data.volunteer_picked_up_at
    || data.delivery_verification_status !== "pending"
    || data.volunteer_delivered_at
    || !data.volunteer_id) {
    throw new DeliveryOtpError("This delivery is not ready for an NGO verification code.", 409);
  }
  return data;
}

async function issueNgoDeliveryOtp(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  ngoId: string,
  volunteerId: string,
  secret: string,
) {
  const otp = generateNumericOtp();
  const [otpHash, otpEncrypted] = await Promise.all([
    hashDeliveryOtp(secret, requestId, volunteerId, ngoId, otp),
    encryptDeliveryOtp(secret, requestId, ngoId, otp),
  ]);
  const now = new Date();
  const { data, error } = await admin.rpc("issue_delivery_otp_for_ngo", {
    p_request_id: requestId,
    p_ngo_owner_id: ngoId,
    p_otp_hash: otpHash,
    p_otp_encrypted: otpEncrypted,
    p_expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    p_now: now.toISOString(),
  });
  if (error) throw new Error("The delivery code could not be generated.");
  if (!isOtpDatabaseResult(data)) throw new Error("The verification service returned an invalid result.");
  if (data !== "issued") throw new DeliveryOtpError(otpResultMessage(data), otpResultHttpStatus(data));
  return { otp, expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString() };
}

async function getActiveNgoDeliveryOtp(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  ngoId: string,
  secret: string,
) {
  const { data, error } = await admin
    .from("delivery_otp_challenges")
    .select("otp_encrypted, expires_at, verified_at, used_at")
    .eq("request_id", requestId)
    .eq("ngo_id", ngoId)
    .maybeSingle();
  if (error) throw new Error("The delivery code could not be loaded.");
  if (!data
    || !data.otp_encrypted
    || data.verified_at
    || data.used_at
    || Date.parse(data.expires_at) <= Date.now()) {
    return { ok: true, active: false } as const;
  }
  const otp = await decryptDeliveryOtp(secret, requestId, ngoId, data.otp_encrypted);
  return { ok: true, active: true, otp, expires_at: data.expires_at } as const;
}

Deno.serve(async (request) => {
  try {
    return await handleDeliveryRequest(request);
  } catch {
    return response(
      { error: "Delivery verification could not be completed." },
      500,
      request.headers.get("origin"),
    );
  }
});

async function handleDeliveryRequest(request: Request) {
  const origin = request.headers.get("origin");
  const respond = (body: unknown, status = 200) => response(body, status, origin);
  if (request.method === "OPTIONS") {
    return deliveryOtpPreflightResponse(origin, configuredOrigins());
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
  if (profileError) return respond({ error: "Account authorization could not be verified." }, 500);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return respond({ error: "A JSON request body is required." }, 400);
    body = parsed;
  } catch {
    return respond({ error: "The request body must be valid JSON." }, 400);
  }
  if (!isUuid(body.request_id)) return respond({ error: "A valid request ID is required." }, 400);

  const role = profile?.role as Role | null;
  if (role === "ngo" && (body.action === "ngo_get" || body.action === "ngo_issue")) {
    try {
      const delivery = await getNgoDeliveryRequest(admin, body.request_id, authData.user.id, role);
      if (body.action === "ngo_get") {
        return respond(await getActiveNgoDeliveryOtp(admin, delivery.id, authData.user.id, config.otpSecret));
      }
      const issued = await issueNgoDeliveryOtp(
        admin,
        delivery.id,
        authData.user.id,
        delivery.volunteer_id,
        config.otpSecret,
      );
      return respond({ ok: true, active: true, otp: issued.otp, expires_at: issued.expiresAt });
    } catch (error) {
      if (error instanceof DeliveryOtpError) return respond({ error: error.message }, error.status);
      return respond({ error: "The NGO delivery code could not be managed." }, 500);
    }
  }

  if (role !== "volunteer") {
    return respond({ error: "This action is not authorized for your account." }, 403);
  }
  if (body.action !== "verify") {
    return respond({ error: "Choose an authorized delivery verification action." }, 400);
  }
  if (typeof body.otp !== "string" || !/^\d{4}$/.test(body.otp)) {
    return respond({ error: "Enter the four-digit NGO delivery code." }, 400);
  }

  try {
    const assigned = await getAssignedRequest(admin, body.request_id, authData.user.id);
    if ("error" in assigned) return respond({ error: assigned.error }, assigned.status);
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
  } catch {
    return respond({ error: "Delivery verification could not be completed." }, 500);
  }
}
