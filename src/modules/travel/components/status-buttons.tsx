import { setCandidateStatusAction } from "../actions";
import type { CandidateStatus } from "../server/labels";
import { smallButtonClass } from "./ui";

const ACTIONS: Record<
  CandidateStatus,
  { to: CandidateStatus; label: string; title?: string }[]
> = {
  option: [
    { to: "shortlisted", label: "Shortlist" },
    { to: "rejected", label: "Reject" },
  ],
  shortlisted: [
    {
      to: "booked",
      label: "Mark booked",
      title: "Record that you booked this yourself. Caddy never books.",
    },
    { to: "option", label: "Unshortlist" },
    { to: "rejected", label: "Reject" },
  ],
  booked: [{ to: "shortlisted", label: "Not booked after all" }],
  rejected: [{ to: "option", label: "Restore" }],
};

export function StatusButtons({
  tripId,
  candidateId,
  status,
  destination,
}: {
  tripId: string;
  candidateId: string;
  status: CandidateStatus;
  destination: string;
}) {
  return (
    <>
      {ACTIONS[status].map((a) => (
        <form
          key={a.to}
          action={setCandidateStatusAction.bind(
            null,
            tripId,
            candidateId,
            a.to,
          )}
        >
          <button
            type="submit"
            title={a.title}
            aria-label={`${a.label}: ${destination}`}
            className={smallButtonClass}
          >
            {a.label}
          </button>
        </form>
      ))}
    </>
  );
}
