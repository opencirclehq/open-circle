import { useMemo, useState } from "react";
import { CheckReadIcon, CopyIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { highlightLines, TOKEN_CLASS } from "./highlight";

export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
    return false;
  }
}

/** Highlighted source with line numbers, its file name and a copy button. Scrolls inside itself. */
export function CodeView({ code, label, maxHeight = "32rem" }: { code: string; label: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => highlightLines(code.trimEnd()), [code]);

  return (
    <figure className="overflow-hidden rounded-[22px] bg-[hsl(var(--foreground)/0.04)]">
      <figcaption className="flex items-center justify-between gap-3 bg-foreground/[0.03] py-2 pl-4 pr-2 text-xs text-t2">
        <span className="truncate font-mono">{label}</span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={async () => { if (await copyText(code, `${label} copied.`)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-t3 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          {copied ? <CheckReadIcon className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
        </button>
      </figcaption>
      <pre className="overflow-auto px-4 py-4 text-[12.5px] leading-[1.7]" style={{ maxHeight }} tabIndex={0} aria-label={label}>
        <code className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 font-mono">
          {lines.map((tokens, index) => (
            <span key={index} className="contents">
              <span className="select-none text-right tabular text-t4" aria-hidden>{index + 1}</span>
              <span className="whitespace-pre">
                {tokens.length ? tokens.map((token, at) => <span key={at} className={TOKEN_CLASS[token.kind]}>{token.text}</span>) : " "}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
