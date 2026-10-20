import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <div className="grid content-start gap-[22px]">
          <Card className="grid gap-3 p-4">
            <h2 className="text-[1.05rem] font-semibold">Appearance</h2>
            <ThemeSwitcher />
            <p className="text-sm text-muted">
              Dark is Dracula. Light is Alucard, its official light variant.
              System follows your phone or computer.
            </p>
          </Card>
          <Card className="grid gap-2 p-4">
            <h2 className="text-[1.05rem] font-semibold">
              Install on your phone
            </h2>
            <p className="text-sm text-muted">
              <strong className="text-fg">iPhone:</strong> open Caddy in Safari,
              tap Share, then Add to Home Screen. Notifications only work once
              it&apos;s installed.
            </p>
            <p className="text-sm text-muted">
              <strong className="text-fg">Android:</strong> open Caddy in
              Chrome, tap the menu, then Install app.
            </p>
          </Card>
        </div>
        <EmptyState icon={Activity} title="Background jobs">
          The daily housing check, reminders and backups will list their last
          run and result here.
        </EmptyState>
      </div>
    </>
  );
}
