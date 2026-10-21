import Link from "next/link";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TONES } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { formatWhen } from "@/server/domain/relative-time";
import { MarkReadOnView } from "./mark-read";

export const metadata = { title: "Inbox" };

const SEVERITY_TONE = {
  info: TONES.info,
  success: TONES.ok,
  warning: TONES.due,
  critical: TONES.bad,
} as const;

export default async function InboxPage() {
  await requireHousehold();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, severity, action_url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Couldn't load your inbox: ${error.message}`);
  const now = new Date();
  const hasUnread = data.some((n) => !n.read_at);

  return (
    <>
      <PageHeader eyebrow="Alerts and updates" title="Inbox" />
      <MarkReadOnView hasUnread={hasUnread} />
      {data.length === 0 ? (
        <EmptyState icon={Bell} title="No alerts yet">
          New matching homes, deadlines, bills to review and failed background
          checks will arrive here, and on your phone once notifications are
          switched on in Settings.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {data.map((n) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="w-1 self-stretch rounded"
                  style={{
                    background:
                      SEVERITY_TONE[n.severity as keyof typeof SEVERITY_TONE],
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className={n.read_at ? "block" : "block font-semibold"}>
                    {n.title}
                  </span>
                  {n.body ? (
                    <span className="block text-sm text-muted">{n.body}</span>
                  ) : null}
                </span>
                <span className="num shrink-0 text-xs text-muted">
                  {formatWhen(new Date(n.created_at), now)}
                </span>
                {n.read_at ? null : <span className="sr-only">Unread</span>}
              </>
            );
            return n.action_url ? (
              <Link
                key={n.id}
                href={n.action_url}
                className="flex items-start gap-3 px-4 py-3 hover:bg-fg/4"
              >
                {content}
              </Link>
            ) : (
              <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                {content}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
