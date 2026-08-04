"use client";

import { useEffect } from "react";

/**
 * Opens the print dialog once the page has rendered.
 *
 * A rAF inside the effect rather than calling print() directly: on Chrome,
 * printing during the same paint can capture the page before fonts and layout
 * have settled, which shows up as a PDF with the wrong column widths.
 */
export function PrintTrigger() {
  useEffect(() => {
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
