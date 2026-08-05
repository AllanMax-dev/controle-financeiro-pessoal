"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button" type="submit" disabled={pending}>
      {pending ? "Salvando..." : label}
    </button>
  );
}
