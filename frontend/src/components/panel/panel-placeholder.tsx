/**
 * Placeholder for panel sections that are not implemented yet.
 *
 * Shown rather than omitted so that the milestone state of the tool is visible in the interface and
 * not only in the plan. It is removed section by section as each milestone lands.
 */

export function PanelPlaceholder({
  readyFrom,
  items,
}: {
  readyFrom: string;
  items: readonly string[];
}) {
  return (
    <div className="px-4 pb-4">
      <p className="text-xs text-ink-muted">
        Not wired until milestone <span className="font-mono text-ink-faint">{readyFrom}</span>.
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-ink-secondary">
            {/* aria-hidden: the label is decorative status information, and the sentence above
                already says what this list means to anyone using a screen reader. */}
            <span className="h-px w-3 shrink-0 bg-hairline-strong" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
