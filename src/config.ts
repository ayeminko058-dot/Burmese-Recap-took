/**
 * Standalone global application configuration asset.
 * Contains hidden, persistent fallback strings and handles silent server discovery.
 */

export const LIVE_SERVER_URL = "https://ais-dev-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app";
export const PRODUCTION_SERVER_URL = "https://ais-pre-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app";
export const VERCEL_BACKEND_URL = "https://my-edge-tts-api.vercel.app";

// Detect environment configuration silently in the background
const isProd = typeof window !== "undefined" && (
  window.location.hostname.includes("-pre-") ||
  window.location.hostname.includes("vercel.app") ||
  (import.meta as any).env?.PROD
);

export const DEFAULT_API_BASE_URL = isProd ? PRODUCTION_SERVER_URL : LIVE_SERVER_URL;
