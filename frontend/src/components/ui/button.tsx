import type { ButtonHTMLAttributes } from "react";
import { buttonClass, type Variant } from "./button-class";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "sm" }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}
