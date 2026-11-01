import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { fieldClass } from "@/components/ui/field-class";
import { Field } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { clearLocalData } from "@/lib/profile-store";
import { useToast } from "@/lib/toast-context";

const CONFIRM_WORD = "delete";

/** What DELETE /me can't remove, as the backend words it. */
type Deleted = { retained: string[] };

function DeleteAccountForm({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (typed.trim().toLowerCase() !== CONFIRM_WORD) {
      setError(`Type "${CONFIRM_WORD}" to confirm.`);
      return;
    }
    const address = auth.session?.address;
    if (!address) return;
    setBusy(true);
    try {
      // The backend asks for the account address from GET /me, so nothing is deleted by accident. A demo
      // session's address in the browser is the sample one, not its server account's.
      const { user } = await api<{ user: { address: string } }>("/me");
      const { retained } = await api<Deleted>("/me", { method: "DELETE", json: { confirm: user.address } });
      clearLocalData(address);
      await auth.signOut().catch(() => {});
      toast.success({
        title: "Your account is deleted",
        description: retained.length ? retained[0] : "Everything Sovra stored for you is gone.",
      });
      navigate("/");
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.");
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-4 px-6 py-6">
        <p>
          This deletes your profile, accounts, transactions, budgets, goals, memories, Ask history and reminders from
          Sovra, and signs you out on every device. It can't be undone.
        </p>
        <ul className="list-disc pl-5 text-[14px] text-muted">
          <li>Encrypted copies of memories already on Walrus stay there until their storage period ends. Sovra never uses them again.</li>
          <li>Sui transactions are public and permanent. Sovra only read them.</li>
          <li>Questions sent to Groq follow Groq's own retention policy.</li>
        </ul>
        <Field label={`Type "${CONFIRM_WORD}" to confirm`} error={error}>
          <input
            className={fieldClass}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="bg-over hover:bg-over">
          <Trash2 className="size-4" aria-hidden />
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </form>
  );
}

/** Download everything Sovra stores, or delete the account. Needs a backend session. */
export function YourDataPanel() {
  const auth = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const connected = auth.server === "verified";

  async function download() {
    setExporting(true);
    try {
      const body = await api<{ exportedAt?: string }>("/me/export");
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sovra-export-${(body.exportedAt ?? new Date().toISOString()).slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success({ title: "Your data is downloading", description: "One JSON file with everything Sovra stores for you." });
    } catch (err) {
      toast.error({ title: "Couldn't export your data", description: err instanceof ApiError ? err.message : "Try again in a moment." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Panel title="Your data">
      <p className="text-[14px] text-muted">
        {connected
          ? "Download a copy of everything Sovra stores for you, or delete your account and all of its data."
          : "Exporting and deleting your data need a connection to Sovra's server. Sign in again once it's reachable."}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={download} disabled={!connected || exporting}>
          <Download className="size-4" aria-hidden />
          {exporting ? "Preparing…" : "Download my data"}
        </Button>
        <button
          type="button"
          onClick={() => setDeleting(true)}
          disabled={!connected}
          className={`${buttonClass("secondary")} text-over hover:border-over hover:bg-over-soft`}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete account
        </button>
      </div>
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete your account?" description="This can't be undone.">
        <DeleteAccountForm onClose={() => setDeleting(false)} />
      </Modal>
    </Panel>
  );
}
