"use client";

// A submit button that asks for confirmation before letting its <form> submit.
// Lets a server-action form (server component) get a client-side confirm dialog
// on destructive actions without turning the whole form into a client component.
export default function ConfirmSubmit({
  children,
  message,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  /** Optional submit-button form field (e.g. name="status" value="cancelled")
      so a multi-button server-action form can confirm just one of its actions. */
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
