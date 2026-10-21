import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

async function unreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0; // The badge is a convenience; never block the page on it.
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const inbox = await unreadCount();
  return <AppShell badges={{ inbox }}>{children}</AppShell>;
}
