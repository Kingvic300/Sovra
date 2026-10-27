import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopUpDialog } from "./top-up-dialog";

/** Button that opens the USDC top-up flow. */
export function TopUpButton({
  variant = "primary",
  size = "sm",
  label = "Top up",
  className = "",
}: {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {label}
      </Button>
      <TopUpDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
