import { useId, useRef, useState } from "react";
import { MESSAGE_PREVIEW_VALUES, MESSAGE_TEMPLATES, messageTemplateError, renderMessageTemplate, type BotMessages, type MessageKey } from "@shared/bot-settings";
import { SharedSelect } from "@/components/ui/select";
import { MetalButton } from "@/components/metal-button";
import { DisclosureSummary } from "@/components/ui/disclosure";

export function AdminBotMessages({ messages, disabled, onChange }: { messages: BotMessages; disabled: boolean; onChange: (key: MessageKey, value: string) => void }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [activeEditor, setActiveEditor] = useState<MessageKey | null>(null);
  const groups = [...new Set(Object.values(MESSAGE_TEMPLATES).map((field) => field.section))];
  const entries = (Object.entries(MESSAGE_TEMPLATES) as [MessageKey, typeof MESSAGE_TEMPLATES[MessageKey]][]).filter(([key, field]) => key === activeEditor || (group === "all" || group === field.section) && `${field.label} ${field.description} ${messages[key]}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="py-5">
    <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_13rem]">
      <div><label htmlFor="bot-message-search" className="sr-only">Search message formats</label><input id="bot-message-search" type="search" className="field h-11 text-sm" placeholder="Search messages or text…" value={search} onChange={(event) => { setSearch(event.target.value); setActiveEditor(null); }} /></div>
      <SharedSelect aria-label="Message category" value={group} onValueChange={(value) => { setGroup(value); setActiveEditor(null); }} options={[{ value: "all", label: "All message types" }, ...groups.map((value) => ({ value, label: value }))]} />
    </div>
    <p className="mb-4 text-sm text-t3">{entries.length} of {Object.keys(MESSAGE_TEMPLATES).length} formats. Select a message to edit it. Previews use sample values and send nothing. A welcome already in progress finishes before its new format takes effect.</p>
    <div className="divide-y divide-foreground/[0.06]">
      {entries.map(([key, field]) => <MessageEditor key={key} messageKey={key} field={field} value={messages[key]} disabled={disabled} onEditing={() => setActiveEditor(key)} onChange={(value) => onChange(key, value)} />)}
    </div>
    {!entries.length && <p className="py-5 text-sm text-t2">No message formats match. Try another search or category.</p>}
  </div>;
}

function MessageEditor({ messageKey, field, value, disabled, onChange, onEditing }: { messageKey: MessageKey; field: typeof MESSAGE_TEMPLATES[MessageKey]; value: string; disabled: boolean; onChange: (value: string) => void; onEditing: () => void }) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const error = messageTemplateError(messageKey, value);
  const customized = value !== field.body;
  const insert = (variable: string) => {
    const element = input.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const token = `{{${variable}}}`;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(start + token.length, start + token.length); });
  };
  return <details className="group py-3" onFocusCapture={onEditing}>
    <DisclosureSummary className="rounded-xl text-sm font-medium">
      {field.label}{customized && <span className="ml-2 text-xs font-normal text-t3">Edited</span>}
    </DisclosureSummary>
    <div className="space-y-4 pb-3 pt-2">
      <p id={`${id}-description`} className="max-w-prose text-sm leading-relaxed text-t3">{field.description}</p>
      <div>
        <label htmlFor={id} className="mb-2 block text-sm text-t2">{field.label} message</label>
        <textarea ref={input} id={id} rows={7} maxLength={field.maxLength} disabled={disabled} className="field min-h-40 resize-y rounded-2xl py-3 text-sm leading-relaxed" value={value} aria-invalid={!!error} aria-describedby={`${id}-description ${id}-length${error ? ` ${id}-error` : ""}`} onChange={(event) => onChange(event.target.value)} />
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-t3"><span id={`${id}-length`}>{value.length} / {field.maxLength} characters</span><span>{field.section}</span></div>
        {error && <p id={`${id}-error`} className="mt-2 text-sm text-[hsl(var(--down))]" role="alert">{error}</p>}
      </div>
      {field.variables.length > 0 && <div><p className="mb-2 text-xs text-t3">Insert a variable. Required: {field.required.length ? field.required.map((name) => `{{${name}}}`).join(", ") : "none"}.</p><div className="flex flex-wrap gap-2">{field.variables.map((name) => <button key={name} type="button" disabled={disabled} onClick={() => insert(name)} className="min-h-11 rounded-full sm:min-h-9 bg-foreground/[0.06] px-3 text-xs text-t2 transition-colors hover:bg-foreground/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-50">{`{{${name}}}`}</button>)}</div></div>}
      <div className="rounded-2xl bg-foreground/[0.03] p-4"><p className="mb-3 text-xs text-t3">Preview with sample values</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-t2 [overflow-wrap:anywhere]">{renderMessageTemplate(value, MESSAGE_PREVIEW_VALUES)}</p></div>
      <MetalButton type="button" variant="minimal" className="h-10 w-auto" wrapperClassName="overflow-clip rounded-full" innerClassName="px-4" disabled={disabled || !customized} onClick={() => onChange(field.body)}>Reset this message</MetalButton>
    </div>
  </details>;
}
