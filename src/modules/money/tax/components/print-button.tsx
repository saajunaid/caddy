"use client";

import { Printer } from "lucide-react";
import { btnPrimary } from "../../ui";

export function PrintButton() {
  return (
    <button type="button" className={btnPrimary} onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      Print or save as PDF
    </button>
  );
}
