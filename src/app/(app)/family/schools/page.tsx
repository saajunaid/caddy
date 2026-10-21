import Link from "next/link";
import { ExternalLink, GraduationCap, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import { StatusChip } from "@/modules/family/components/cards";
import { LEVEL_LABELS } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import {
  buttonClass,
  linkClass,
  primaryButtonClass,
} from "@/modules/family/components/ui";
import {
  loadMembers,
  loadSchools,
  type Application,
} from "@/modules/family/queries";
import { SCHOOL_LEVELS } from "@/modules/family/schemas";
import {
  ageLabel,
  ECCE_INFO_URL,
  ecceHint,
} from "@/modules/family/server/people.ts";
import { daysBetween } from "@/server/domain/dates";
import { dublinDate, formatShortDate } from "@/modules/family/server/time.ts";

export const metadata = { title: "School places" };

function DateCell({
  label,
  date,
  today,
  urgent,
}: {
  label: string;
  date: string | null;
  today: string;
  urgent?: boolean;
}) {
  if (!date) return null;
  const days = daysBetween(today, date);
  const tone =
    urgent && days < 0 ? "text-bad" : urgent && days <= 7 ? "text-due" : "";
  return (
    <span className={`text-sm ${tone}`}>
      <span className="text-muted">{label} </span>
      <span className="num">
        {formatShortDate(date, Number(today.slice(0, 4)))}
      </span>
      {urgent && days < 0 ? " · passed" : null}
    </span>
  );
}

export default async function SchoolsPage() {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const today = dublinDate(new Date());
  const [{ schools, applications }, members] = await Promise.all([
    loadSchools(),
    loadMembers(),
  ]);
  const children = members.filter((m) => m.relationship === "child");
  const schoolById = new Map(schools.map((s) => [s.id, s]));
  const appsByChild = new Map<string, Application[]>();
  for (const a of applications) {
    const list = appsByChild.get(a.childMemberId) ?? [];
    list.push(a);
    appsByChild.set(a.childMemberId, list);
  }
  const canAddApplication = schools.length > 0 && children.length > 0;

  return (
    <>
      <BackLink href="/family">Family</BackLink>
      <PageHeader
        eyebrow="Education planner"
        title="School places"
        actions={
          <>
            <Link href="/family/schools/new" className={buttonClass}>
              <Plus aria-hidden="true" className="size-4" />
              Add school
            </Link>
            {canAddApplication ? (
              <Link
                href="/family/schools/applications/new"
                className={primaryButtonClass}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add application
              </Link>
            ) : null}
          </>
        }
      />
      <p className="rounded-r-lg border-l-[3px] border-line bg-sunk px-3 py-2.5 text-sm text-muted">
        Being close to a school doesn&apos;t guarantee a place; check each
        school&apos;s admissions policy. Dates here are what you entered, so
        re-check them on the school&apos;s website.
      </p>

      {children.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Add a child first">
          Applications are tracked per child. Add a child with their date of
          birth on the{" "}
          <Link href="/family#people" className={linkClass}>
            Family page
          </Link>{" "}
          to see their ECCE guide and track school places.
        </EmptyState>
      ) : (
        <section className="grid gap-3">
          <h2 className="text-[1.05rem] font-semibold">Applications</h2>
          {children.map((child) => {
            const apps = (appsByChild.get(child.id) ?? []).sort(
              (a, b) =>
                a.intakeYear - b.intakeYear ||
                (a.preferenceRank ?? 99) - (b.preferenceRank ?? 99),
            );
            const ecce = child.dateOfBirth
              ? ecceHint(child.dateOfBirth, today)
              : null;
            const age = child.dateOfBirth
              ? ageLabel(child.dateOfBirth, today)
              : null;
            return (
              <Card key={child.id} className="grid">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
                  <h3 className="font-semibold">
                    {child.name}
                    {age ? (
                      <span className="font-normal text-muted"> · {age}</span>
                    ) : null}
                  </h3>
                  {ecce ? (
                    <span className="text-sm">
                      <span className="text-review">{ecce.label}</span>{" "}
                      <a
                        href={ECCE_INFO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        guide only
                      </a>
                    </span>
                  ) : null}
                </div>
                {apps.length === 0 ? (
                  <p className="px-4 pb-3.5 text-sm text-muted">
                    No schools added for {child.name} yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {apps.map((a) => {
                      const school = schoolById.get(a.schoolId);
                      return (
                        <li key={a.id}>
                          <Link
                            href={`/family/schools/applications/${a.id}`}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-fg/4"
                          >
                            <span className="num w-7 shrink-0 text-sm text-muted">
                              {a.preferenceRank ? `#${a.preferenceRank}` : "–"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold wrap-anywhere">
                                {school?.name ?? "School"}
                              </span>
                              <span className="block text-sm text-muted">
                                Starting Sept {a.intakeYear}
                                {school
                                  ? ` · ${LEVEL_LABELS[school.level] ?? school.level}`
                                  : ""}
                              </span>
                            </span>
                            <StatusChip status={a.status} />
                            <span className="flex basis-full flex-wrap gap-x-4 gap-y-0.5 pl-10">
                              <DateCell
                                label="Deadline"
                                date={a.applicationDeadline}
                                today={today}
                                urgent={a.status === "researching"}
                              />
                              <DateCell
                                label="Open day"
                                date={a.openDay}
                                today={today}
                              />
                              <DateCell
                                label="Decision"
                                date={a.decisionDate}
                                today={today}
                              />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-[1.05rem] font-semibold">
          Schools you&apos;re tracking
        </h2>
        {schools.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No schools yet"
            footer={
              <Link href="/family/schools/new" className={primaryButtonClass}>
                Add a school
              </Link>
            }
          >
            Add preschools and schools you&apos;re considering, with a link to
            each admissions policy and the date you last checked it.
          </EmptyState>
        ) : (
          SCHOOL_LEVELS.map((level) => {
            const atLevel = schools.filter((s) => s.level === level);
            if (atLevel.length === 0) return null;
            return (
              <Card key={level}>
                <h3 className="px-4 pt-3.5 pb-1 text-sm font-semibold text-muted">
                  {LEVEL_LABELS[level]}
                </h3>
                <ul className="divide-y divide-line">
                  {atLevel.map((s) => (
                    <li key={s.id} className="grid gap-1 px-4 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`/family/schools/${s.id}`}
                          className="font-semibold wrap-anywhere hover:underline"
                        >
                          {s.name}
                        </Link>
                        {s.website ? (
                          <a
                            href={s.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${linkClass} inline-flex items-center gap-1`}
                          >
                            Website
                            <ExternalLink
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          </a>
                        ) : null}
                      </div>
                      {s.address ? (
                        <span className="text-sm text-muted">{s.address}</span>
                      ) : null}
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        {s.admissionsPolicyUrl ? (
                          <a
                            href={s.admissionsPolicyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${linkClass} inline-flex items-center gap-1`}
                          >
                            Admissions policy
                            <ExternalLink
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          </a>
                        ) : (
                          <Chip tone="review">No policy link</Chip>
                        )}
                        {s.policyCheckedOn ? (
                          <span className="text-muted">
                            checked on{" "}
                            <span className="num">
                              {formatShortDate(
                                s.policyCheckedOn,
                                Number(today.slice(0, 4)),
                              )}
                            </span>
                          </span>
                        ) : s.admissionsPolicyUrl ? (
                          <Chip tone="review">Not checked yet</Chip>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </section>
    </>
  );
}
