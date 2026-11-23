import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: ReactNode; error?: string; hint?: ReactNode; hideLabel?: boolean };

function Wrapper({ id, label, error, hint, hideLabel, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export const TextField = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, hideLabel, id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Wrapper id={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <input ref={ref} id={fieldId} className={`input ${error ? "input-invalid" : ""} ${className}`} aria-invalid={!!error || undefined} aria-describedby={describedBy(fieldId, error, hint)} {...rest} />
    </Wrapper>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, Common & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, error, hint, hideLabel, id, className = "", children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Wrapper id={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <select ref={ref} id={fieldId} className={`select ${error ? "input-invalid" : ""} ${className}`} aria-invalid={!!error || undefined} aria-describedby={describedBy(fieldId, error, hint)} {...rest}>
        {children}
      </select>
    </Wrapper>
  );
});

export const TextareaField = forwardRef<HTMLTextAreaElement, Common & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextareaField(
  { label, error, hint, hideLabel, id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Wrapper id={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <textarea ref={ref} id={fieldId} className={`textarea ${error ? "input-invalid" : ""} ${className}`} aria-invalid={!!error || undefined} aria-describedby={describedBy(fieldId, error, hint)} {...rest} />
    </Wrapper>
  );
});

export function Checkbox({ label, className = "", ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`checkbox-row ${className}`}>
      <input type="checkbox" className="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
