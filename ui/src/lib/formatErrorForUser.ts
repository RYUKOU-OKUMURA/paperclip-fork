import i18n from "@/i18n";
import { ApiError } from "@/api/client";

function httpMessage(status: number): string {
  const key = `errors:http.${status}` as const;
  const translated = i18n.t(key, { ns: "errors" });
  if (translated !== key) return translated;
  return i18n.t("errors:requestFailed", { status });
}

/**
 * Maps API and generic errors to short Japanese messages for the board UI.
 * Technical English from the server may be dropped in favor of status-based copy.
 */
export function formatErrorForUser(error: unknown): string {
  if (error instanceof ApiError) {
    return httpMessage(error.status);
  }
  if (error instanceof Error) {
    const msg = error.message;
    if (/^Request failed: \d+$/.test(msg)) {
      const status = Number(msg.replace("Request failed: ", ""));
      if (!Number.isNaN(status)) return httpMessage(status);
    }
    if (/^Failed to load session \(\d+\)$/.test(msg)) {
      const m = msg.match(/\((\d+)\)/);
      const status = m ? Number(m[1]) : 500;
      return i18n.t("errors:failedToLoadSession", { status });
    }
    return msg;
  }
  return i18n.t("errors:unknown", { ns: "errors" });
}
