import { Capacitor } from "@capacitor/core";

/**
 * Returns a fully qualified absolute URL for API calls in native environments,
 * or the relative path when running on the web preview.
 * This prevents relative path resolution failures inside the native app container.
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (Capacitor.getPlatform() === "web") {
    return cleanEndpoint;
  }

  // Retrieve the injected app URL or default to the verified Cloud Run deployed URL
  const baseAppUrl = ((import.meta as any).env?.VITE_APP_URL || "https://ais-dev-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app").trim();
  const cleanBase = baseAppUrl.endsWith("/") ? baseAppUrl.slice(0, -1) : baseAppUrl;

  return `${cleanBase}${cleanEndpoint}`;
}
