import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function CommunitySections({ section, children, actions, disabled = false, onChange }: { section: "discussions" | "questions" | "events" | "submissions"; children: ReactNode; actions?: ReactNode; disabled?: boolean; onChange?: () => void }) {
  const navigate = useNavigate();
  return <Tabs value={section} onValueChange={value => { onChange?.(); navigate(value === "events" ? "/events" : value === "submissions" ? "/community?tab=questions&mine=1" : `/community?tab=${value}`); }}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <TabsList aria-label="Community sections"><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="discussions">Discussions</TabsTrigger><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="questions">Questions</TabsTrigger><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="events">Events</TabsTrigger><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="submissions">My submissions</TabsTrigger></TabsList>
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
    <TabsContent value={section}>{children}</TabsContent>
  </Tabs>;
}
