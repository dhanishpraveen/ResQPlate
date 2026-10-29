import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, HeartHandshake, Leaf } from "lucide-react";
import { AuthLayout } from "../components/layout";
import { Button, Checkbox, InlineAlert, LoadingState, SelectField, StatusBadge, TextField, TextareaField } from "../components/ui";
import type { UserRole } from "../components/navigation";
import { useAuth, roleHome } from "./AuthContext";
import { callbackDestination, getMissingNgoOrganizationDetails, getMissingNgoProfileDetails, isE164Phone, roleDestination, validateProfileImage } from "./validation";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

type AuthLocationState = { from?: { pathname?: string } };
const roles: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: "donor", label: "Restaurant / Donor", detail: "Share safe surplus food" },
  { value: "ngo", label: "NGO", detail: "Request food for your community" },
  { value: "volunteer", label: "Volunteer", detail: "Help deliver food locally" },
];

function AuthError({ children }: { children: ReactNode }) {
  return <InlineAlert tone="danger" title="We couldn't complete that request">{children}</InlineAlert>;
}

function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="auth-footer">{children}</p>;
}

function AuthFormError({ value }: { value: string | null }) {
  return value ? <AuthError>{value}</AuthError> : null;
}

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as AuthLocationState | null)?.from?.pathname;
  const { session, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && profile?.role) navigate(roleHome(profile.role), { replace: true });
  }, [session, profile, navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError(supabaseConfigurationError); return; }
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) { setError(signInError.message); return; }
    if (from && ["/onboarding/profile", "/onboarding/donor", "/onboarding/ngo", "/onboarding/role"].some((path) => from.startsWith(path))) {
      navigate(from, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }

  return (
    <AuthLayout subtitle="Sign in to continue your food rescue journey." title="Welcome Back!">
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        <TextField autoComplete="email" label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        <TextField autoComplete="current-password" label="Password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        <div className="auth-inline-link"><Link to="/reset-password">Forgot password?</Link></div>
        <Button className="auth-submit" loading={busy} type="submit">Sign In</Button>
        <AuthFooter>New to ResQPlate? <Link to="/sign-up">Create an account</Link></AuthFooter>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage({ role: presetRole }: { role?: UserRole }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(presetRole ?? "donor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError(supabaseConfigurationError); return; }
    if (!isE164Phone(phone)) {
      setError("Enter a phone number in international format, for example +14155552671.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), phone_number: phone.trim(), role },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (signUpError) { setError(signUpError.message); return; }
    if (data.session && data.session.user?.email_confirmed_at !== null) {
      navigate(roleDestination(role), { replace: true });
    } else {
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`, { replace: true });
    }
  }

  return (
    <AuthLayout subtitle="Create an account to make safe surplus food go further." title="Create Your Account">
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        <TextField autoComplete="name" label="Full name" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
        <TextField autoComplete="email" label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        <TextField autoComplete="tel" hint="Use international format, including country code." label="Phone number" onChange={(event) => setPhone(event.target.value)} required type="tel" value={phone} />
        <TextField autoComplete="new-password" hint="At least 8 characters." label="Password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        <fieldset className="auth-role-fieldset">
          <legend className="ui-label">I am joining as</legend>
          <div className="auth-role-grid">
            {roles.map((option) => (
              <label className={`auth-role-option ${role === option.value ? "is-selected" : ""}`} key={option.value}>
                <input checked={role === option.value} name="role" onChange={() => setRole(option.value)} type="radio" value={option.value} />
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button className="auth-submit" loading={busy} type="submit">Sign Up</Button>
        <AuthFooter>Already have an account? <Link to="/">Sign in</Link></AuthFooter>
      </form>
    </AuthLayout>
  );
}

export function EmailSentPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const otpInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  function updateOtp(value: string, index: number) {
    const digits = value.replace(/\D/g, "").slice(0, 1);
    const next = otp.split("");
    next[index] = digits;
    const normalized = Array.from({ length: 8 }, (_, position) => next[position] ?? "").join("");
    setOtp(normalized);
    setError(null);
    setMessage(null);
    if (digits && index < 7) otpInputs.current[index + 1]?.focus();
  }

  function pasteOtp(value: string, index: number) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (!digits) return;
    const start = digits.length === 8 ? 0 : index;
    const next = Array.from({ length: 8 }, (_, position) => otp[position] ?? "");
    digits.split("").forEach((digit, offset) => {
      if (start + offset < 8) next[start + offset] = digit;
    });
    setOtp(next.join(""));
    setError(null);
    setMessage(null);
    otpInputs.current[Math.min(start + digits.length, 7)]?.focus();
  }

  function handleOtpKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      event.preventDefault();
      otpInputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpInputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 7) {
      event.preventDefault();
      otpInputs.current[index + 1]?.focus();
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError(supabaseConfigurationError); return; }
    if (!email) { setError("The email address is missing. Return to registration and try again."); return; }
    if (otp.length !== 8 || /\D/.test(otp)) { setError("Enter the eight-digit verification code from your email."); return; }
    setBusy(true);
    setError(null);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "signup" });
    setBusy(false);
    if (verifyError) {
      setError("That code is invalid, expired, or already used. Request a new code and try again.");
      return;
    }
    const role = data.user?.user_metadata.role as UserRole | undefined;
    navigate(roleDestination(role ?? null), { replace: true });
  }

  async function resend() {
    if (!supabase) { setError(supabaseConfigurationError); return; }
    if (!email) { setError("The email address is missing. Return to registration and try again."); return; }
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setBusy(false);
    if (resendError) setError(resendError.message);
    else {
      setOtp("");
      setResendCooldown(60);
      setMessage("A new eight-digit verification code has been sent.");
    }
  }

  return (
    <AuthLayout subtitle="Enter the one-time code from your inbox to continue." title="Verify Your Email">
      <form className="auth-form-stack" onSubmit={(event) => void verify(event)}>
        <div className="auth-feature-icon"><CheckCircle2 aria-hidden="true" size={24} /></div>
        <p>We sent an eight-digit verification code to <strong>{email || "your email address"}</strong>.</p>
        {message && <InlineAlert tone="success" title="Email sent">{message}</InlineAlert>}
        <AuthFormError value={error} />
        <fieldset className="auth-otp-fieldset">
          <legend className="ui-label">Verification code</legend>
          <div aria-label="Eight-digit verification code" className="auth-otp-inputs">
            {Array.from({ length: 8 }, (_, index) => (
              <input
                aria-label={`Verification digit ${index + 1}`}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                className="auth-otp-input"
                inputMode="numeric"
                key={index}
                maxLength={1}
                onChange={(event) => updateOtp(event.target.value, index)}
                onKeyDown={(event) => handleOtpKeyDown(event, index)}
                onPaste={(event) => {
                  event.preventDefault();
                  pasteOtp(event.clipboardData.getData("text"), index);
                }}
                pattern="[0-9]"
                ref={(element) => { otpInputs.current[index] = element; }}
                required
                type="text"
                value={otp[index] ?? ""}
              />
            ))}
          </div>
        </fieldset>
        <Button disabled={otp.length !== 8 || /\D/.test(otp)} loading={busy} type="submit">Verify email</Button>
        <Button disabled={busy || resendCooldown > 0} onClick={() => void resend()} type="button" variant="outline">
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend OTP"}
        </Button>
        <AuthFooter><Link to="/">Back to sign in</Link></AuthFooter>
      </form>
    </AuthLayout>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    async function finish() {
      if (!supabase) { setError(supabaseConfigurationError); setBusy(false); return; }
      const code = search.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (active) { setError(exchangeError.message); setBusy(false); }
          return;
        }
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) { setError(sessionError.message); setBusy(false); return; }
      if (!data.session) { setError("The confirmation link is invalid, expired, or already used. Request a new one."); setBusy(false); return; }
      const next = search.get("next");
      const role = data.session.user.user_metadata.role === "ngo" ? "ngo" : null;
      navigate(callbackDestination(next, role), { replace: true });
    }
    void finish().catch((caught: unknown) => {
      if (active) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setBusy(false);
      }
    });
    return () => { active = false; };
  }, [navigate, search]);

  return (
    <AuthLayout title={error ? "Confirmation link unavailable" : "Confirming your email"}>
      <div className="auth-form-stack">
        {busy && <LoadingState label="Checking your secure confirmation link" />}
        <AuthFormError value={error} />
        {error && <Button onClick={() => navigate("/", { replace: true })} type="button" variant="outline">Back to sign in</Button>}
      </div>
    </AuthLayout>
  );
}

export function LogoutPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  async function signOut() {
    if (!supabase) { setError(supabaseConfigurationError); return; }
    setBusy(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) setError(signOutError.message);
    else navigate("/sign-in", { replace: true });
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!session) navigate("/sign-in", { replace: true });
    else void signOut();
  }, []);
  return (
    <AuthLayout title={error ? "Could not sign out" : "Signing out"}>
      <div className="auth-form-stack">
        {busy && <LoadingState label="Ending your session" />}
        <AuthFormError value={error} />
        {error && <Button onClick={() => void signOut()} type="button">Try again</Button>}
      </div>
    </AuthLayout>
  );
}

export function ResetPasswordPage({ update = false }: { update?: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError(supabaseConfigurationError); return; }
    setBusy(true);
    setError(null);
    if (update) {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (updateError) setError(updateError.message);
      else { setMessage("Your password has been updated."); window.setTimeout(() => navigate("/", { replace: true }), 1200); }
    } else {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/update`,
      });
      setBusy(false);
      if (resetError) setError(resetError.message);
      else setMessage("If an account exists for that address, a password-reset link will arrive shortly.");
    }
  }

  return (
    <AuthLayout subtitle={update ? "Choose a new password for your account." : "We'll email you a secure link to reset your password."} title={update ? "Set a New Password" : "Forgot Password?"}>
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        {message && <InlineAlert tone="success" title="Done">{message}</InlineAlert>}
        {update
          ? <TextField autoComplete="new-password" label="New password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          : <TextField autoComplete="email" label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />}
        <Button className="auth-submit" loading={busy} type="submit">{update ? "Update Password" : "Send Reset Link"}</Button>
        <AuthFooter><Link to="/">Back to sign in</Link></AuthFooter>
      </form>
    </AuthLayout>
  );
}

export function ChooseRolePage() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>(() => {
    const metadataRole = session?.user.user_metadata?.role;
    return metadataRole === "ngo" || metadataRole === "volunteer" || metadataRole === "donor"
      ? metadataRole
      : "donor";
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) { setError("Your session is unavailable. Sign in again."); return; }
    setBusy(true);
    setError(null);
    const { error: assignError } = await supabase.rpc("assign_initial_role", { p_role: role });
    if (assignError) { setError(assignError.message); setBusy(false); return; }
    if (!await refreshProfile()) {
      setError("Your role was assigned, but your application profile could not be loaded. Refresh the page before continuing.");
      setBusy(false);
      return;
    }
    setBusy(false);
    navigate("/onboarding/profile", { replace: true });
  }
  if (profile?.role) return <AuthRedirect to={roleHome(profile.role)} />;
  return (
    <AuthLayout subtitle="Choose your role to begin. This choice is assigned once and cannot be changed here." title="Choose Your Role">
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        <RoleChoices onChange={setRole} value={role} />
        <Button className="auth-submit" loading={busy} type="submit">Continue</Button>
      </form>
    </AuthLayout>
  );
}

function RoleChoices({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <fieldset className="auth-role-fieldset">
      <legend className="ui-label">I am joining as</legend>
      <div className="auth-role-grid">
        {roles.map((option) => (
          <label className={`auth-role-option ${value === option.value ? "is-selected" : ""}`} key={option.value}>
            <input checked={value === option.value} name="role" onChange={() => onChange(option.value)} type="radio" value={option.value} />
            <span><strong>{option.label}</strong><small>{option.detail}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AuthRedirect({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return <LoadingState label="Opening your account" />;
}

export function ProfileOnboardingPage() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone_number ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [about, setAbout] = useState(profile?.about ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = profile?.role;

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone_number ?? "");
    setAddress(profile?.address ?? "");
    setAbout(profile?.about ?? "");
  }, [profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !profile) { setError("Your profile session is unavailable. Sign in again."); return; }
    if (!isE164Phone(phone)) { setError("Enter your phone number in international format, for example +14155552671."); return; }
    if (role === "donor" && !address.trim()) { setError("Enter your address to continue."); return; }
    if (avatar && validateProfileImage(avatar)) {
      setError(validateProfileImage(avatar));
      return;
    }
    setBusy(true);
    setError(null);
    let avatarPath = profile.avatar_path;
    if (avatar) {
      const ext = avatar.type === "image/jpeg" ? "jpg" : avatar.type.split("/")[1];
      avatarPath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-images").upload(avatarPath, avatar, { contentType: avatar.type, upsert: false });
      if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    }
    const { error: updateError } = await supabase.from("user_profiles").update({
      full_name: fullName.trim(),
      phone_number: phone.trim(),
      address: address.trim() || null,
      about: about.trim() || null,
      avatar_path: avatarPath,
    }).eq("id", session.user.id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    if (!await refreshProfile()) {
      setError("Your profile details were saved, but your application profile could not be reloaded. Refresh the page before continuing.");
      return;
    }
    navigate(role === "donor" ? "/onboarding/donor" : role === "ngo" ? "/onboarding/ngo/organization" : "/volunteer", { replace: true });
  }

  return (
    <AuthLayout subtitle="Add the details your community needs to coordinate with you." title="Complete Your Profile">
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        <label className="ui-field">
          <span className="ui-label">Profile photo <span className="ui-hint">(optional, JPG/PNG/WebP up to 5 MB)</span></span>
          <input accept="image/jpeg,image/png,image/webp" className="ui-input auth-file-input" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} type="file" />
        </label>
        <TextField autoComplete="name" label="Full name" maxLength={120} onChange={(event) => setFullName(event.target.value)} required value={fullName} />
        <TextField autoComplete="tel" hint="Include your country code, such as +1." label="Phone number" onChange={(event) => setPhone(event.target.value)} required type="tel" value={phone} />
        {role === "donor" && <TextareaField autoComplete="street-address" label="Address" onChange={(event) => setAddress(event.target.value)} required value={address} />}
        {role !== "donor" && <TextareaField label="Address (optional)" onChange={(event) => setAddress(event.target.value)} value={address} />}
        <TextareaField label="About you (optional)" maxLength={1000} onChange={(event) => setAbout(event.target.value)} value={about} />
        <Button className="auth-submit" loading={busy} type="submit">Continue</Button>
      </form>
    </AuthLayout>
  );
}

export function DonorOnboardingPage() {
  const { session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [opens, setOpens] = useState("09:00");
  const [closes, setCloses] = useState("17:00");
  const [capacity, setCapacity] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    const userId = session.user.id;
    let active = true;
    async function load() {
      try {
        const { data, error: loadError } = await client.from("donor_profiles").select("*").eq("id", userId).maybeSingle();
        if (!active) return;
        if (loadError) { setError(loadError.message); return; }
        if (!data) return;
        setBusinessName(data.business_name ?? "");
        setCuisine(data.cuisine_type ?? "");
        setBusinessAddress(data.business_address ?? "");
        const hours = data.operating_hours;
        if (hours && typeof hours === "object" && !Array.isArray(hours)) {
          const opening = hours.opens;
          const closing = hours.closes;
          if (typeof opening === "string") setOpens(opening);
          if (typeof closing === "string") setCloses(closing);
        }
        setCapacity(data.food_capacity_per_day?.toString() ?? "");
        setTerms(Boolean(data.terms_accepted_at));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    }
    void load();
    return () => { active = false; };
  }, [session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericCapacity = Number(capacity);
    if (!supabase || !session) { setError("Your session is unavailable. Sign in again."); return; }
    if (!Number.isInteger(numericCapacity) || numericCapacity <= 0) { setError("Enter a positive whole-number daily food capacity."); return; }
    if (!terms) { setError("Accept the food donation terms to continue."); return; }
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase.from("donor_profiles").update({
      business_name: businessName.trim(),
      cuisine_type: cuisine.trim(),
      business_address: businessAddress.trim(),
      operating_hours: { opens, closes },
      food_capacity_per_day: numericCapacity,
      terms_accepted_at: new Date().toISOString(),
    }).eq("id", session.user.id);
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    if (!await refreshProfile()) {
      setError("Your donor details were saved, but your application profile could not be reloaded. Refresh the page before continuing.");
      return;
    }
    navigate("/donor", { replace: true });
  }

  return (
    <AuthLayout subtitle="Tell us about your food business so your donations can be coordinated safely." title="Set Up Your Donor Profile">
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        <TextField autoComplete="organization" label="Business / restaurant name" maxLength={180} onChange={(event) => setBusinessName(event.target.value)} required value={businessName} />
        <TextField label="Cuisine type" onChange={(event) => setCuisine(event.target.value)} required value={cuisine} />
        <TextareaField autoComplete="street-address" label="Business address" onChange={(event) => setBusinessAddress(event.target.value)} required value={businessAddress} />
        <div className="auth-two-fields">
          <TextField label="Opens" onChange={(event) => setOpens(event.target.value)} required type="time" value={opens} />
          <TextField label="Closes" onChange={(event) => setCloses(event.target.value)} required type="time" value={closes} />
        </div>
        <TextField hint="Whole number of portions your business can typically donate each day." label="Food capacity per day" min="1" onChange={(event) => setCapacity(event.target.value)} required type="number" value={capacity} />
        <Checkbox checked={terms} description="Confirm that food donations will be represented accurately and prepared/handled safely." label="I agree to the food donation terms" onChange={setTerms} />
        <Button className="auth-submit" loading={busy} type="submit">Get Started</Button>
      </form>
    </AuthLayout>
  );
}

type NgoStep = "organization" | "contact";
type NgoDraft = {
  organization_name: string | null;
  organization_address: string | null;
  registration_number: string | null;
  organization_type: string | null;
  description: string | null;
  contact_name: string | null;
  contact_designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

const ngoSteps: NgoStep[] = ["organization", "contact"];

function isNgoStep(value: string | undefined): value is NgoStep {
  return value === "organization" || value === "contact";
}

export function NgoOnboardingPage() {
  const { step: rawStep } = useParams();
  const step = isNgoStep(rawStep) ? rawStep : "organization";
  const stepIndex = ngoSteps.indexOf(step);
  const { session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<NgoDraft>({
    organization_name: "",
    organization_address: "",
    registration_number: "",
    organization_type: "",
    description: "",
    contact_name: "",
    contact_designation: "",
    contact_email: "",
    contact_phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !session) { setLoading(false); return; }
      const { data, error: loadError } = await supabase
        .from("ngo_profiles")
        .select("organization_name, organization_address, registration_number, organization_type, description, contact_name, contact_designation, contact_email, contact_phone")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      else if (data) {
        setDraft({
          organization_name: data.organization_name,
          organization_address: data.organization_address,
          registration_number: data.registration_number,
          organization_type: data.organization_type,
          description: data.description,
          contact_name: data.contact_name,
          contact_designation: data.contact_designation,
          contact_email: data.contact_email ?? session.user.email ?? "",
          contact_phone: data.contact_phone,
        });
      } else {
        setError("The NGO organization profile was not found. Sign out and contact support before continuing.");
      }
      setLoading(false);
    }
    void load().catch((loadError: unknown) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [session]);

  function updateDraft<Key extends keyof NgoDraft>(key: Key, value: NgoDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!supabase || !session) { setError("Your session is unavailable. Sign in again."); return; }
    setBusy(true);
    setError(null);
    try {
      const submittedValues = new FormData(event.currentTarget);
      const value = (field: keyof NgoDraft) => {
        const submitted = submittedValues.get(field);
        return typeof submitted === "string" ? submitted.trim() : draft[field]?.trim() ?? "";
      };
      const changes: Partial<NgoDraft> = {};
      if (step === "organization") {
        changes.organization_name = value("organization_name");
        changes.organization_address = value("organization_address");
        changes.registration_number = value("registration_number");
        changes.organization_type = value("organization_type");
        changes.description = value("description");
        if (!changes.organization_type) {
          throw new Error("Choose an organization type before continuing.");
        }
      } else if (step === "contact") {
        if (!isE164Phone(value("contact_phone"))) {
          throw new Error("Enter the contact phone number in international format, for example +14155552671.");
        }
        changes.organization_name = value("organization_name");
        changes.organization_address = value("organization_address");
        changes.registration_number = value("registration_number");
        changes.organization_type = value("organization_type");
        changes.description = value("description");
        changes.contact_name = value("contact_name");
        changes.contact_designation = value("contact_designation");
        changes.contact_email = value("contact_email");
        changes.contact_phone = value("contact_phone");
      }
      const { data: savedProfile, error: saveError } = await supabase
        .from("ngo_profiles")
        .update(changes)
        .eq("id", session.user.id)
        .select("organization_name, organization_address, registration_number, organization_type, contact_name, contact_designation, contact_email, contact_phone")
        .maybeSingle();
      if (saveError) {
        throw new Error(`Organization profile update failed: ${saveError.message}`);
      }
      if (!savedProfile) {
        throw new Error("No organization profile row was updated. Check that the signed-in account has an NGO profile, then retry.");
      }
      if (step === "organization") {
        const missingOrganizationDetails = getMissingNgoOrganizationDetails(savedProfile);
        if (missingOrganizationDetails.length > 0) {
          throw new Error(`The organization profile update did not save these required details: ${missingOrganizationDetails.join(", ")}. Correct them before continuing.`);
        }
      }
      if (step === "contact") {
        const missingDetails = getMissingNgoProfileDetails(savedProfile);
        if (missingDetails.length > 0) {
          throw new Error(`The organization profile was saved, but these required details are missing: ${missingDetails.join(", ")}. Reopen the organization or contact step and save them before continuing.`);
        }
      }
      if (!await refreshProfile()) {
        throw new Error("Your organization details were saved, but your application profile could not be reloaded. Refresh the page before continuing.");
      }
      if (stepIndex < ngoSteps.length - 1) {
        navigate(`/onboarding/ngo/${ngoSteps[stepIndex + 1]}`);
      } else {
        navigate("/ngo", { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AuthLayout title="Loading organization profile"><LoadingState label="Loading saved onboarding details" /></AuthLayout>;
  const title = step === "organization" ? "Organization Details" : "Contact Person Details";
  return (
    <AuthLayout subtitle={`Step ${stepIndex + 1} of 2 · ${title}`} title="NGO Sign Up">
      <div className="auth-stepper" aria-label={`Step ${stepIndex + 1} of 2`}>
        {ngoSteps.map((label, index) => <span className={index <= stepIndex ? "is-current" : ""} key={label}>{index + 1}<small>{label}</small></span>)}
      </div>
      <form className="auth-form-stack" onSubmit={(event) => void submit(event)}>
        <AuthFormError value={error} />
        {step === "organization" && <>
          <TextField autoComplete="organization" label="Organization name" maxLength={180} name="organization_name" onChange={(event) => updateDraft("organization_name", event.target.value)} required value={draft.organization_name ?? ""} />
          <SelectField label="Organization type" name="organization_type" onChange={(event) => updateDraft("organization_type", event.target.value)} options={[
            { value: "nonprofit", label: "Nonprofit organization" },
            { value: "community", label: "Community organization" },
            { value: "shelter", label: "Shelter" },
            { value: "other", label: "Other" },
          ]} required value={draft.organization_type ?? ""} />
          <TextField label="Registration number" name="registration_number" onChange={(event) => updateDraft("registration_number", event.target.value)} required value={draft.registration_number ?? ""} />
          <TextareaField autoComplete="street-address" label="Organization address" name="organization_address" onChange={(event) => updateDraft("organization_address", event.target.value)} required value={draft.organization_address ?? ""} />
          <TextareaField label="Organization description (optional)" maxLength={1000} name="description" onChange={(event) => updateDraft("description", event.target.value)} value={draft.description ?? ""} />
        </>}
        {step === "contact" && <>
          <TextField autoComplete="name" label="Contact person's name" name="contact_name" onChange={(event) => updateDraft("contact_name", event.target.value)} required value={draft.contact_name ?? ""} />
          <TextField label="Role / designation" name="contact_designation" onChange={(event) => updateDraft("contact_designation", event.target.value)} required value={draft.contact_designation ?? ""} />
          <TextField autoComplete="email" label="Contact email" name="contact_email" onChange={(event) => updateDraft("contact_email", event.target.value)} required type="email" value={draft.contact_email ?? session?.user.email ?? ""} />
          <TextField autoComplete="tel" hint="Include your country code." label="Contact phone" name="contact_phone" onChange={(event) => updateDraft("contact_phone", event.target.value)} required type="tel" value={draft.contact_phone ?? ""} />
        </>}
        <div className="auth-button-row">
          {stepIndex > 0 && <Button icon={<ArrowLeft size={16} />} onClick={() => navigate(`/onboarding/ngo/${ngoSteps[stepIndex - 1]}`)} type="button" variant="outline">Back</Button>}
          <Button className="auth-submit" icon={stepIndex < ngoSteps.length - 1 ? <ArrowRight size={16} /> : undefined} loading={busy} type="submit">{stepIndex < ngoSteps.length - 1 ? "Next" : "Complete Registration"}</Button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function FuturePhasePage({ role }: { role: UserRole }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roleTitle = role === "ngo" ? "NGO" : role === "donor" ? "Donor" : "Volunteer";
  const displayName = profile?.full_name ?? "your account";
  async function signOut() {
    if (!supabase) { setError(supabaseConfigurationError); return; }
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setError(error.message);
    else navigate("/sign-in", { replace: true });
  }
  return (
    <main className="future-phase-page">
      <header className="future-phase-header"><span className="layout-brand"><span className="layout-brand-symbol"><Leaf aria-hidden="true" size={19} /></span>ResQPlate</span><Button loading={busy} onClick={() => void signOut()} type="button" variant="outline">Sign out</Button></header>
      <section className="future-phase-card">
        <AuthFormError value={error} />
        <span className="auth-feature-icon"><HeartHandshake aria-hidden="true" size={25} /></span>
        <StatusBadge tone="success">{roleTitle} account secured</StatusBadge>
        <h1>Welcome, {displayName}</h1>
        <p>Authentication and {roleTitle.toLowerCase()} onboarding are ready. The {roleTitle.toLowerCase()} dashboard and operational workflows are planned for a later phase.</p>
        <p className="ui-hint">Your role controls access; account information is loaded from the Supabase profile and protected by database policies.</p>
      </section>
    </main>
  );
}

export function VolunteerHome() {
  return <FuturePhasePage role="volunteer" />;
}
