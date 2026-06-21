/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubtitleBlock {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface DownloadTask {
  id: string;
  title: string;
  url: string;
  progress: number;
  speedMBs: number; // in Megabytes per second
  downloadedMB: number;
  totalMB: number;
  status: "idle" | "queued" | "downloading" | "paused" | "completed" | "failed";
  errorMsg?: string;
  category: "video" | "audio" | "recap";
  completedAt?: string;
  downloadUrl?: string;
}

export interface VoiceOption {
  code: string;
  name: string;
  language: string;
  flag: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning";
  timestamp: string;
}
