"use client";

import { Icon } from "@/components/ui/icons";

export function ConfirmActionForm({
  action,
  fields,
  label,
  message,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  message: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <button className="text-button text-button-danger" type="submit">
        <Icon name="archive" />
        {label}
      </button>
    </form>
  );
}
