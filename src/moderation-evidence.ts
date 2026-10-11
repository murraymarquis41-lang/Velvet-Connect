export const EVIDENCE_BUCKET = "moderation-evidence";
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export function validateEvidenceFile(file: Pick<File, "size" | "type">): string | null {
  if (!["image/png", "image/jpeg"].includes(file.type)) return "Use a PNG or JPEG screenshot.";
  if (file.size < 1 || file.size > MAX_EVIDENCE_BYTES) return "Evidence must be between 1 byte and 5 MiB.";
  return null;
}

export function evidenceDownloadName(mime: string): string {
  return mime === "image/png" ? "case-evidence.png" : "case-evidence.jpg";
}
