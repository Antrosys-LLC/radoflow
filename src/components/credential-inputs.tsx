"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { formatCnic } from "@/lib/cnic";

/**
 * The two fields every credential form needs, sharing one look.
 *
 * Both are uncontrolled apart from the behaviour that has to be intercepted —
 * dash insertion and visibility — so they drop into a plain `<form action>`
 * without a state library.
 */

const FIELD_CLASS =
  "w-full rounded-2xl border border-input bg-background px-4 py-3.5 text-base text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30";

export function CnicInput({
  id,
  name = "cnic",
  defaultValue = "",
  required,
  autoFocus,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(() => formatCnic(defaultValue));

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="username"
      required={required}
      autoFocus={autoFocus}
      placeholder="35201-1234567-8"
      value={value}
      /*
       * Reformatting on every keystroke means the dashes appear as the number
       * is typed and a pasted number is corrected on arrival. Deleting works
       * because removing a digit re-runs the same formatting over what is
       * left, so the dash before it disappears with it rather than trapping
       * the cursor.
       */
      onChange={(event) => setValue(formatCnic(event.target.value))}
      className={className ?? `${FIELD_CLASS} font-mono tracking-wide`}
    />
  );
}

export function PasswordInput({
  id,
  name = "password",
  autoComplete = "current-password",
  required,
  minLength,
  defaultValue,
  value,
  onChange,
  placeholder = "••••••••",
  className,
}: {
  id?: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  /** Supply with `onChange` to drive the field from the parent. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={fieldId}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue })}
        placeholder={placeholder}
        className={`${className ?? FIELD_CLASS} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        // The control only toggles what is already on this screen, so it stays
        // out of the tab order that runs field → field → submit.
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
