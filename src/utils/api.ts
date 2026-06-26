import { Capacitor } from "@capacitor/core";

/**
 * Returns a fully qualified absolute URL for API calls in native environments,
 * or the relative path when running on the web preview.
 * This prevents relative path resolution failures inside the native app container.
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window !== "undefined") {
    const platform = Capacitor.getPlatform();
    const origin = window.location.origin;

    // Auto-save the origin if running on the web (this registers the Cloud Run URL automatically)
    if (platform === "web" || (platform !== "ios" && platform !== "android")) {
      if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1") && !origin.includes("capacitor://")) {
        localStorage.setItem("server_url", origin);
      }
      return cleanEndpoint;
    }

    // Check if there is a custom server URL configured in localStorage
    const savedServerUrl = localStorage.getItem("server_url");
    if (savedServerUrl && savedServerUrl.trim()) {
      return `${savedServerUrl.trim()}${cleanEndpoint}`;
    }
  }

  // Check if there is a VITE_APP_URL environment variable from build configurations
  const envUrl = (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && envUrl.trim()) {
    return `${envUrl.trim()}${cleanEndpoint}`;
  }

  // Hardcoded active Cloud Run service URL fallback so it works out of the box in production APK builds
  const defaultFallback = "https://ais-pre-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app";
  return `${defaultFallback}${cleanEndpoint}`;
}
