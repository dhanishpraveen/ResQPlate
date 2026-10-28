import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="ui-spin" size={17} /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = "", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`ui-icon-button ${className}`.trim()}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & FieldProps;

export function TextField({
  label,
  hint,
  error,
  required,
  id,
  type = "text",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true" className="ui-required"> *</span>}
      </label>
      <div className="ui-input-wrap">
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className="ui-input"
          id={inputId}
          required={required}
          type={isPassword && revealed ? "text" : type}
          {...props}
        />
        {isPassword && (
          <IconButton
            className="ui-password-toggle"
            label={revealed ? "Hide password" : "Show password"}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </IconButton>
        )}
      </div>
      {hint && !error && <span className="ui-hint" id={`${inputId}-hint`}>{hint}</span>}
      {error && <span className="ui-error-text" id={`${inputId}-error`}><AlertCircle size={14} />{error}</span>}
    </div>
  );
}

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;

export function TextareaField({
  label,
  hint,
  error,
  required,
  id,
  className = "",
  ...props
}: TextareaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true" className="ui-required"> *</span>}
      </label>
      <textarea
        aria-describedby={describedBy || undefined}
        aria-invalid={Boolean(error)}
        className={`ui-input ui-textarea ${className}`.trim()}
        id={inputId}
        required={required}
        {...props}
      />
      {hint && !error && <span className="ui-hint" id={`${inputId}-hint`}>{hint}</span>}
      {error && <span className="ui-error-text" id={`${inputId}-error`}><AlertCircle size={14} />{error}</span>}
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & FieldProps & {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export function SelectField({
  label,
  hint,
  error,
  required,
  id,
  options,
  placeholder,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = [hint && `${selectId}-hint`, error && `${selectId}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={selectId}>
        {label}
        {required && <span aria-hidden="true" className="ui-required"> *</span>}
      </label>
      <div className="ui-input-wrap">
        <select
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className="ui-input ui-select"
          id={selectId}
          required={required}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="ui-select-icon" size={16} />
      </div>
      {hint && !error && <span className="ui-hint" id={`${selectId}-hint`}>{hint}</span>}
      {error && <span className="ui-error-text" id={`${selectId}-error`}><AlertCircle size={14} />{error}</span>}
    </div>
  );
}

interface ChoiceProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({ label, description, checked, disabled, onChange }: ChoiceProps) {
  const id = useId();
  return (
    <label className={`ui-choice ${disabled ? "is-disabled" : ""}`} htmlFor={id}>
      <input
        checked={checked}
        className="ui-check"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      <span className="ui-choice-copy">
        <span className="ui-choice-label">{label}</span>
        {description && <span className="ui-hint">{description}</span>}
      </span>
    </label>
  );
}

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  label: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
}

export function RadioGroup({ label, name, options, value, onChange }: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset className="ui-field ui-radio-group">
      <legend className="ui-label">{label}</legend>
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <label className="ui-choice" htmlFor={optionId} key={option.value}>
            <input
              checked={value === option.value}
              className="ui-radio"
              id={optionId}
              name={name}
              onChange={() => onChange?.(option.value)}
              type="radio"
              value={option.value}
            />
            <span className="ui-choice-copy">
              <span className="ui-choice-label">{option.label}</span>
              {option.description && <span className="ui-hint">{option.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

interface SwitchProps extends Omit<ChoiceProps, "checked"> {
  checked: boolean;
}

export function SwitchToggle({ label, description, checked, disabled, onChange }: SwitchProps) {
  const id = useId();
  return (
    <label className={`ui-switch-row ${disabled ? "is-disabled" : ""}`} htmlFor={id}>
      <span className="ui-choice-copy">
        <span className="ui-choice-label">{label}</span>
        {description && <span className="ui-hint">{description}</span>}
      </span>
      <input
        checked={checked}
        className="ui-switch-input"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange?.(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className="ui-switch-track"><span /></span>
    </label>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

export function Card({ children, className = "", padding = "md" }: CardProps) {
  return <section className={`ui-card ui-card--${padding} ${className}`.trim()}>{children}</section>;
}

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: "green" | "mint" | "amber" | "blue";
}

export function StatCard({ label, value, detail, icon, tone = "green" }: StatCardProps) {
  return (
    <Card className="ui-stat-card" padding="md">
      <span className={`ui-icon-container ui-icon-container--${tone}`} aria-hidden="true">{icon}</span>
      <span className="ui-stat-copy">
        <span className="ui-stat-label">{label}</span>
        <strong className="ui-stat-value">{value}</strong>
        {detail && <span className="ui-hint">{detail}</span>}
      </span>
    </Card>
  );
}

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`ui-badge ui-badge--${tone}`}><span aria-hidden="true" className="ui-badge-dot" />{children}</span>;
}

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <span className={`ui-avatar ui-avatar--${size}`} aria-label={name} role="img">
      {src ? <img alt="" src={src} /> : initials || "?"}
    </span>
  );
}

export function IconContainer({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "mint" | "amber" | "blue";
}) {
  return <span aria-hidden="true" className={`ui-icon-container ui-icon-container--${tone}`}>{children}</span>;
}

export function SectionHeading({
  title,
  description,
  action,
  level = 2,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="ui-section-heading">
      <div>
        <Heading>{title}</Heading>
        {description && <p className="ui-section-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="ui-state ui-state--empty">
      <IconContainer>{icon ?? <Info size={22} />}</IconContainer>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-live="polite" className="ui-state ui-state--loading">
      <LoaderCircle aria-hidden="true" className="ui-spin" size={25} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-alert ui-alert--danger" role="alert">
      <AlertCircle aria-hidden="true" size={19} />
      <span className="ui-alert-copy"><strong>{title}</strong><span>{description}</span></span>
      {onRetry && <Button onClick={onRetry} size="sm" variant="outline">Try again</Button>}
    </div>
  );
}

export function InlineAlert({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const Icon = tone === "success" ? ShieldCheck : tone === "warning" ? TriangleAlert : tone === "danger" ? AlertCircle : Info;
  return (
    <div className={`ui-alert ui-alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={19} />
      <span className="ui-alert-copy">{title && <strong>{title}</strong>}<span>{children}</span></span>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      className="ui-dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={onClose}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="ui-dialog-icon"><TriangleAlert aria-hidden="true" size={22} /></div>
      <IconButton className="ui-dialog-close" label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
      <h2 id="confirmation-title">{title}</h2>
      <p id="confirmation-description">{description}</p>
      <div className="ui-dialog-actions">
        <Button onClick={onClose} variant="outline">{cancelLabel}</Button>
        <Button onClick={onConfirm} variant={destructive ? "danger" : "primary"}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}

export function FormDemo() {
  const [checked, setChecked] = useState(true);
  const [accountType, setAccountType] = useState("donor");
  return (
    <div className="ui-form-grid">
      <TextField label="Email address" type="email" placeholder="name@example.com" required />
      <TextField label="Password" type="password" placeholder="Enter a password" hint="Use at least 8 characters." />
      <TextField label="Phone number" type="tel" placeholder="+91 00000 00000" />
      <SelectField
        label="Cuisine type"
        placeholder="Choose a type"
        options={[
          { value: "indian", label: "Indian" },
          { value: "continental", label: "Continental" },
          { value: "other", label: "Other" },
        ]}
      />
      <TextareaField className="ui-form-grid__wide" label="Additional details" placeholder="Add a short note" rows={3} />
      <div className="u-stack">
        <Checkbox checked={checked} label="I agree to the terms" onChange={setChecked} />
        <RadioGroup
          label="Account type"
          name="account-type-demo"
          options={[
            { value: "donor", label: "Restaurant / Donor" },
            { value: "ngo", label: "NGO" },
            { value: "volunteer", label: "Volunteer" },
          ]}
          onChange={setAccountType}
          value={accountType}
        />
      </div>
      <SwitchToggle checked={checked} label="Receive notifications" onChange={setChecked} />
    </div>
  );
}

export function SuccessMark() {
  return <span aria-hidden="true" className="ui-success-mark"><Check size={18} /></span>;
}

export function FoodListingCard({
  name,
  category,
  quantity,
  pickupWindow,
  status,
  image,
}: {
  name: string;
  category: string;
  quantity: string;
  pickupWindow: string;
  status: string;
  image?: string;
}) {
  return (
    <article className="ui-food-card">
      {image ? (
        <img alt="" className="ui-food-image" src={image} />
      ) : (
        <div aria-label="Food image placeholder" className="ui-food-image ui-food-placeholder" role="img">
          <Info aria-hidden="true" size={20} />
          <span>Food photo unavailable</span>
        </div>
      )}
      <div className="ui-food-copy">
        <div className="ui-food-title">
          <h3>{name}</h3>
          <StatusBadge tone="success">{status}</StatusBadge>
        </div>
        <p>{category} <span aria-hidden="true">·</span> {quantity}</p>
        <span className="ui-hint">Pickup {pickupWindow}</span>
      </div>
    </article>
  );
}

export interface TimelineStep {
  label: string;
  detail?: string;
  state: "complete" | "current" | "upcoming";
}

export function ProgressTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol aria-label="Progress" className="ui-timeline">
      {steps.map((step, index) => (
        <li className={`ui-timeline-step ui-timeline-step--${step.state}`} key={`${step.label}-${index}`}>
          <span aria-hidden="true" className="ui-timeline-marker">
            {step.state === "complete" ? <Check size={13} /> : index + 1}
          </span>
          <span className="ui-timeline-copy">
            <strong>{step.label}</strong>
            {step.detail && <span>{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
