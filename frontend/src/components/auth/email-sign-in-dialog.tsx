import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field-class";
import { Field } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Errors = { email?: string; password?: string; confirm?: string };

function EmailSignInForm({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState(auth.passwordEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const changing = auth.passwordEmail !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {
      email: EMAIL.test(email.trim()) ? undefined : "Enter a valid email address.",
      password: password.length >= MIN_PASSWORD ? undefined : `Use at least ${MIN_PASSWORD} characters.`,
      confirm: confirm === password ? undefined : "The passwords don't match.",
    };
    setErrors(next);
    if (next.email || next.password || next.confirm) return;

    setBusy(true);
    try {
      await auth.setEmailSignIn({ email: email.trim(), password });
      toast.success({
        title: changing ? "Email sign-in updated" : "Email sign-in added",
        description: `Next time, sign in with ${email.trim().toLowerCase()} and your password, or with your wallet.`,
      });
      onDone();
    } catch (err) {
      toast.error({
        title: err instanceof ApiError && err.code === "email_taken" ? "That email is already in use" : "Couldn't save email sign-in",
        description: err instanceof ApiError ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-5 px-6 py-6">
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
            autoFocus
          />
        </Field>
        <Field label={changing ? "New password" : "Password"} error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
          <span className="relative block">
            <input
              className={`${fieldClass} pr-12`}
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
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
        <Field label="Confirm password" error={errors.confirm}>
          <input
            className={fieldClass}
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={200}
          />
        </Field>
        <p className="rounded-xl bg-porcelain px-4 py-3 text-[14px] text-muted">
          Your wallet keeps working. Both sign-ins open this same account, with the same memories and data.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {busy ? "Saving" : changing ? "Update" : "Add email sign-in"}
        </Button>
      </div>
    </form>
  );
}

/** Settings dialog that adds email and password sign-in to a wallet account, or changes them. */
export function EmailSignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { passwordEmail } = useAuth();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={passwordEmail ? "Change email sign-in" : "Add email sign-in"}
      description="Sign in with an email and password as well as your wallet."
    >
      <EmailSignInForm onDone={onClose} />
    </Modal>
  );
}
