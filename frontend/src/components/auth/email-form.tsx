import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field-class";
import { Field } from "@/components/ui/form-controls";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Errors = { name?: string; email?: string; password?: string };

/** Email and password sign-up (with a name) or sign-in. Field problems show under the field; server answers as toasts. */
export function EmailForm({ mode, disabled, onBusy }: { mode: "signin" | "signup"; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const signup = mode === "signup";

  function validate(): Errors {
    return {
      name: signup && !name.trim() ? "Tell Sovra what to call you." : undefined,
      email: EMAIL.test(email.trim()) ? undefined : "Enter a valid email address.",
      password: !password
        ? "Enter your password."
        : signup && password.length < MIN_PASSWORD
          ? `Use at least ${MIN_PASSWORD} characters.`
          : undefined,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.name || next.email || next.password) return;

    setBusy(true);
    onBusy(true);
    try {
      if (signup) await auth.signUpWithEmail({ name: name.trim(), email: email.trim(), password });
      else await auth.signInWithEmail({ email: email.trim(), password });
      // The guard on /app sends new users to onboarding.
      navigate("/app", { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      toast.error({
        title: code === "email_taken" ? "That email already has an account" : signup ? "Couldn't create your account" : "Couldn't sign you in",
        description: err instanceof ApiError ? err.message : "Try again in a moment.",
        action: code === "email_taken" ? { label: "Sign in instead", onClick: () => navigate("/signin") } : undefined,
      });
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {signup && (
        <Field label="Name" error={errors.name}>
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="What should Sovra call you?"
            maxLength={80}
          />
        </Field>
      )}
      <Field label="Email" error={errors.email}>
        <input
          className={fieldClass}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={200}
        />
      </Field>
      <Field label="Password" error={errors.password} hint={signup ? `At least ${MIN_PASSWORD} characters.` : undefined}>
        <span className="relative block">
          <input
            className={`${fieldClass} pr-12`}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            maxLength={200}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-porcelain hover:text-ink"
          >
            {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
          </button>
        </span>
      </Field>
      <Button type="submit" className="h-12 w-full" disabled={disabled || busy}>
        {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
        {busy ? (signup ? "Creating your account" : "Signing in") : signup ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
