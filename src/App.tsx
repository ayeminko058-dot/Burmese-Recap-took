/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import PhoneMock from "./components/PhoneMock";
import { DownloadTask, AppNotification } from "./types";

interface SavedFile {
  id: string;
  name: string;
  type: "srt" | "audio" | "video";
  timestamp: string;
  size: string;
  data: string;
  audioUrl?: string;
}

export default function App() {
  // Shared States
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: "init_notif",
      title: "Recap Studio Online",
      message: "Welcome, Myanmar Creators! Mount assets inside Downloads.",
      type: "success",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);

  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  
  const [downloadedFiles, setDownloadedFiles] = useState<SavedFile[]>([
    {
      id: "seed_1",
      name: "Burmese_Crime_Recap_Opening.srt",
      type: "srt",
      timestamp: "2026-06-19",
      size: "3 KB",
      data: "1\n00:00:00,200 --> 00:00:03,150\nယခုတစ်ခေါက် တင်ဆက်ပေးမယ့် လူသတ်ကွင်း ဇာတ်လမ်းဟာ\n\n2\n00:00:03,350 --> 00:00:06,800\nအင်္ဂလန်နိုင်ငံ အလယ်ပိုင်းဒေသမှာ အမှန်တကယ် ဖြစ်ပွားခဲ့တဲ့\n"
    },
    {
      id: "seed_2",
      name: "Promotion_Vocal_Thiha.mp3",
      type: "audio",
      timestamp: "2026-06-19",
      size: "820 KB",
      data: "BINARY_SEED_BUFFER",
      audioUrl: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg" // seed fallback URL
    }
  ]);

  const handleAddNotification = (title: string, message: string, type: "info" | "success" | "warning") => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newNotif: AppNotification = {
      id,
      title,
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setNotifications((prev) => [newNotif, ...prev]);

    // Auto prune notifications after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  return (
    <div className="h-screen w-screen bg-[#070B13] text-slate-100 flex items-center justify-center overflow-hidden select-none">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container centering the Interactive Mobile Sandbox */}
      <div className="relative flex flex-col items-center justify-center w-full h-full max-h-full">
        <PhoneMock
          onAddNotification={handleAddNotification}
          notifications={notifications}
          setNotifications={setNotifications}
          tasks={tasks}
          setTasks={setTasks}
          downloadedFiles={downloadedFiles}
          setDownloadedFiles={setDownloadedFiles}
        />
      </div>
    </div>
  );
}

