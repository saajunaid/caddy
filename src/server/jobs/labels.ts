// Friendly names for background jobs. Plain module: used by the app and by scheduled jobs.

const LABELS: Record<string, string> = {
  heartbeat: "Scheduler",
  "family-reminders": "Family reminders",
  "fx-ecb": "Exchange rates (ECB)",
  "travel-weekly": "Travel weekly check",
  "utilities-due": "Utility contract check",
  "housing-daily": "Cost Rental check",
  "housing-news": "Housing news",
  "places-refresh": "Nearby places",
  "places-lookup": "Nearby lookup",
  "documents-sweep": "Unfinished uploads",
  "bill-reader": "Bill reader",
  "daily-digest": "Daily summary",
};

export function jobLabel(jobType: string): string {
  return (
    LABELS[jobType] ??
    jobType.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
