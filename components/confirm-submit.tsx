"use client";

// A submit button that asks for confirmation before letting its <form> submit.
// Lets a server-action form (server component) get a client-side confirm dialog
// on destructive actions without turning the whole form into a client component.
export default function ConfirmSubmit({
  children,
  message,
  className,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
