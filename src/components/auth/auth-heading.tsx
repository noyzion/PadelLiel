/** Title and one calm line of context at the top of an auth screen. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-1.5 text-center">
      <h1 className="text-title font-semibold">{title}</h1>
      {children ? <p className="text-small text-muted">{children}</p> : null}
    </div>
  );
}
