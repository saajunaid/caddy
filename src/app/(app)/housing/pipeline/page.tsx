import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ExternalLink, Landmark } from "lucide-react";
import type { CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, TONES, type Tone } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { ProjectForm } from "@/modules/housing/components/project-form";
import { link, note } from "@/modules/housing/components/styles";
import { dateLabel } from "@/modules/housing/display";
import { loadProjects, type Project } from "@/modules/housing/queries";

export const metadata = { title: "Housing pipeline" };

const CONFIRMATION: Record<string, { label: string; tone: Tone }> = {
  yes: { label: "Confirmed Cost Rental", tone: "ok" },
  no: { label: "Not Cost Rental", tone: "bad" },
  unconfirmed: { label: "Unconfirmed", tone: "review" },
};

const VERIFICATION: Record<string, { label: string; tone: Tone }> = {
  officially_confirmed: { label: "Official", tone: "info" },
  reported: { label: "Reported", tone: "neutral" },
  lead: { label: "Lead", tone: "review" },
  needs_verification: { label: "Needs verification", tone: "review" },
  contradicted: { label: "Contradicted", tone: "bad" },
};

/** Official places to check a lead. Links only; Caddy never contacts anyone. */
const WHERE_TO_VERIFY = [
  { label: "Land Development Agency (LDA)", url: "https://lda.ie/" },
  {
    label: "Limerick City and County Council",
    url: "https://www.limerick.ie/",
  },
  { label: "The Housing Agency", url: "https://www.housingagency.ie/" },
  {
    label: "newstarterhomes.ie: Coming soon",
    url: "https://newstarterhomes.ie/coming-soon/",
  },
];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">
        {value ?? <span className="text-muted">Not stated</span>}
      </dd>
    </>
  );
}

function ProjectCard({ project, today }: { project: Project; today: string }) {
  const confirmation =
    CONFIRMATION[project.cost_rental_confirmed] ?? CONFIRMATION.unconfirmed;
  const verification = VERIFICATION[project.verification] ?? VERIFICATION.lead;
  return (
    <Card className="grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[1.05rem] font-semibold">{project.name}</h2>
          <p className="text-sm text-muted">
            {[project.locality, project.county ? `Co. ${project.county}` : null]
              .filter(Boolean)
              .join(", ") || "Location not stated"}
            {project.provider ? ` · ${project.provider}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={confirmation.tone}>{confirmation.label}</Chip>
          <span
            className="tag"
            style={{ "--c": TONES[verification.tone] } as CSSProperties}
          >
            {verification.label}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-[minmax(110px,40%)_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[0.9rem]">
        <Fact label="Stage" value={project.stage} />
        <Fact
          label="Homes"
          value={
            project.total_homes !== null ? (
              <span className="num">{project.total_homes}</span>
            ) : null
          }
        />
        <Fact
          label="Cost Rental homes"
          value={
            project.cost_rental_homes !== null ? (
              <span className="num">{project.cost_rental_homes}</span>
            ) : null
          }
        />
        <Fact label="Bedroom mix" value={project.bedroom_mix} />
        <Fact label="Expected" value={project.expected_date_text} />
        <Fact
          label="Last checked"
          value={
            project.last_checked_on ? (
              <span className="num">
                {dateLabel(project.last_checked_on, today)}
              </span>
            ) : (
              "Never"
            )
          }
        />
        <Fact
          label="Source"
          value={
            project.source_url ? (
              <a
                href={project.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${link} break-all`}
              >
                {new URL(project.source_url).hostname.replace(/^www\./, "")}
                <ExternalLink
                  aria-hidden="true"
                  className="ml-1 inline size-3"
                />
              </a>
            ) : null
          }
        />
      </dl>
      {project.notes ? <p className={note}>{project.notes}</p> : null}
      <details className="group">
        <summary className={`${link} cursor-pointer text-sm`}>Edit</summary>
        <div className="pt-3">
          <ProjectForm project={project} />
        </div>
      </details>
    </Card>
  );
}

export default async function PipelinePage() {
  await connection();
  const { profile } = await requireHousehold();
  const today = dublinDate(new Date());
  const projects = profile ? await loadProjects() : [];

  return (
    <>
      <Link
        href="/housing"
        className={`${link} inline-flex items-center gap-1 text-sm`}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Housing
      </Link>
      <PageHeader eyebrow="Cost Rental Watch" title="Pipeline" />
      <p className={note}>
        Future developments that may include Cost Rental homes, Limerick first.
        A project is only shown as confirmed Cost Rental when an official or
        provider source says so. Leads stay &ldquo;Unconfirmed&rdquo; until you
        check them.
      </p>

      {projects.length === 0 ? (
        <EmptyState icon={Landmark} title="No projects yet">
          Add developments you hear about, with the source link, to keep track
          of them here.
        </EmptyState>
      ) : (
        <div className="grid gap-3 min-[900px]:grid-cols-2 [&>*]:min-w-0">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} today={today} />
          ))}
        </div>
      )}

      <div className="grid gap-[22px] min-[900px]:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <Card className="grid gap-3 p-4">
          <h2 className="text-[1.05rem] font-semibold">Add a project</h2>
          <ProjectForm />
        </Card>
        <Card className="grid content-start gap-3 p-4">
          <h2 className="text-[1.05rem] font-semibold">Where to verify</h2>
          <ul className="grid gap-2">
            {WHERE_TO_VERIFY.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link}
                >
                  {source.label}
                  <ExternalLink
                    aria-hidden="true"
                    className="ml-1 inline size-3"
                  />
                </a>
              </li>
            ))}
          </ul>
          <p className={note}>
            Housing news from the daily research run appears on the{" "}
            <Link href="/housing#news" className={link}>
              Housing page
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
