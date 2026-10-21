import { AppShell } from "@/components/layout/app-shell";
import { unreadCount } from "@/modules/inbox/unread";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const inbox = await unreadCount();
  return <AppShell badges={{ inbox }}>{children}</AppShell>;
}
