import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useToast } from "@/lib/toast-context";

export function CsvDrop() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const toast = useToast();

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error({ title: `${f.name} isn't a CSV file`, description: "Export your statement as CSV from your bank and try again." });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error({ title: "That file is over 5 MB", description: "Export a shorter date range and try again." });
      return;
    }
    setFile(f);
    toast.success({ title: `${f.name} is ready`, description: "Sovra will show a preview before importing." });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center rounded-card border-2 border-dashed px-5 py-7 text-center transition-colors ${
        over ? "border-cobalt bg-cobalt-soft" : "border-line"
      }`}
    >
      <Upload className="size-5 text-cobalt" aria-hidden />
      {file ? (
        <p className="mt-2">
          <span className="font-semibold">{file.name}</span> is ready. Sovra will match columns and show a preview before importing.
        </p>
      ) : (
        <>
          <p className="mt-2 font-semibold">Drop a statement CSV here</p>
          <p className="text-[13px] text-muted">Date, description and amount columns are enough.</p>
        </>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-3 text-sm font-semibold text-cobalt hover:underline"
      >
        {file ? "Choose a different file" : "Choose file"}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
