import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip, TONES } from "@/components/ui/status";
import { dueState } from "../server/due";
import type { ContractRow } from "../server/rows";
import { asMeterType, asUtilityType } from "../server/rows";
import {
  isEnergy,
  METER_TYPE_LABELS,
  UTILITY_TYPE_LABELS,
} from "../server/types";
import { dueDisplay } from "../server/view";

export function contractTitle(contract: ContractRow): string {
  return `${UTILITY_TYPE_LABELS[asUtilityType(contract.utility_type)]} · ${contract.supplier}`;
}

function contractFacts(contract: ContractRow): string[] {
  const facts: string[] = [];
  if (isEnergy(asUtilityType(contract.utility_type))) {
    facts.push(METER_TYPE_LABELS[asMeterType(contract.meter_type)]);
  }
  if (contract.tariff_name) facts.push(contract.tariff_name);
  if (contract.account_label) facts.push(contract.account_label);
  return facts;
}

/** The prototype's countdown: days until the contract ends, and the 14-day comparison state. */
export function CountdownCard({
  contract,
  today,
  link = true,
}: {
  contract: ContractRow;
  today: string;
  link?: boolean;
}) {
  const display = dueDisplay(
    dueState(contract.contract_end, today),
    contract.status,
  );
  const urgent = display.tone === "due";
  const title = contractTitle(contract);
  return (
    <Card className="flex items-center gap-4 p-4">
      <div
        className="grid size-16 shrink-0 place-items-center rounded-xl border border-line bg-sunk text-center"
        aria-hidden={display.daysLeft === null}
      >
        {display.daysLeft !== null ? (
          <span>
            <b
              className={`num block text-[1.35rem] leading-none ${urgent ? "text-due" : ""}`}
            >
              {display.daysLeft}
            </b>
            <span className="text-[0.65rem] tracking-[0.06em] text-muted uppercase">
              {display.daysLeft === 1 ? "day left" : "days left"}
            </span>
          </span>
        ) : (
          <span className="num text-[1.35rem] text-muted">?</span>
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 className="text-[1.05rem] leading-snug font-semibold">
          {link ? (
            <Link
              href={`/money/utilities/${contract.id}`}
              className="hover:underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <p className="text-sm text-muted">
          {[...contractFacts(contract), display.detail].join(" · ")}
        </p>
        <div>
          <Chip tone={display.tone}>{display.chip}</Chip>
        </div>
      </div>
    </Card>
  );
}

/** Every other contract with its end and due dates, or a prompt when the end date is unknown. */
export function ContractList({
  contracts,
  today,
}: {
  contracts: ContractRow[];
  today: string;
}) {
  return (
    <Card className="divide-y divide-line">
      {contracts.map((contract) => {
        const display = dueDisplay(
          dueState(contract.contract_end, today),
          contract.status,
        );
        const stripe =
          display.tone === "neutral" ? "var(--line)" : TONES[display.tone];
        return (
          <Link
            key={contract.id}
            href={`/money/utilities/${contract.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-fg/4"
          >
            <span
              aria-hidden="true"
              className="w-1 self-stretch rounded"
              style={{ background: stripe } as CSSProperties}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {contractTitle(contract)}
              </span>
              <span className="block text-sm text-muted">{display.detail}</span>
            </span>
            {display.daysLeft !== null && display.tone === "neutral" ? (
              <span className="num shrink-0 text-sm text-muted">
                {display.daysLeft} {display.daysLeft === 1 ? "day" : "days"}
              </span>
            ) : (
              <Chip tone={display.tone}>{display.chip}</Chip>
            )}
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
            />
          </Link>
        );
      })}
    </Card>
  );
}
