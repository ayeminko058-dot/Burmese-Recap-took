/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Terminal, Layers, Cpu, Code, BookOpen, User, CheckCircle, HelpCircle, Phone, Sparkles 
} from "lucide-react";
import PhoneMock from "./components/PhoneMock";
import DeveloperConsole from "./components/DeveloperConsole";
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
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex flex-col justify-between select-none">
      {/* Structural Minimal Header */}
      <header className="border-b border-slate-900 bg-[#0A0E18] py-4 px-6 shrink-0 select-none text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-emerald-600 text-white p-2.5 rounded-2xl shadow-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-white uppercase sm:text-base">
                  Burmese Recap Studio
                </h1>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 py-0.5 px-2 rounded-full font-mono border border-emerald-550/15 uppercase font-bold">
                  PRO AI v1.5
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                Full-scale Clean Code Generator + Multi-Pipeline Android Native Simulator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5 bg-[#121A2E] py-1.5 px-3 rounded-full border border-slate-800">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Host Engine: <b className="text-slate-200">Express + Vite</b></span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#121A2E] py-1.5 px-3 rounded-full border border-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Target: <b className="text-slate-200">Android SDK 34/35</b></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dual Viewport Bento Layout */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col lg:grid lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Android Mobile Simulator */}
        <div className="lg:col-span-5 w-full flex flex-col items-center">
          <div className="text-center mb-1 bg-[#121A2E]/60 border border-slate-800 py-1.5 px-4 rounded-full text-[10px] text-slate-350 select-none flex items-center gap-1.5 leading-none">
            <Phone className="w-3.5 h-3.5 text-blue-400" />
            Interactive Mobile Sandbox (Touch/Scrollable)
          </div>
          
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

        {/* Right column: Clean Architecture Flutter Source Code Editor */}
        <div className="lg:col-span-7 w-full flex flex-col">
          <div className="text-center mb-1 bg-[#121A2E]/60 border border-slate-800 py-1.5 px-4 rounded-full text-[10px] text-slate-350 select-none flex items-center gap-1.5 leading-none self-start">
            <Code className="w-3.5 h-3.5 text-emerald-400" />
            Flutter Clean Arch MVVM Workspace Codebase
          </div>

          <DeveloperConsole onAddNotification={handleAddNotification} />
        </div>
      </main>

      {/* Human design footers */}
      <footer className="border-t border-slate-900 bg-[#080C14] py-4 text-center shrink-0">
        <div className="max-w-7xl mx-auto px-6 text-[10px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
          <p>Designed strictly for Myanmar Recap Creators & Mobile App Architects.</p>
          <p className="flex items-center gap-1 font-mono">
            <span>PLATFORM BUILD: SUCCESS</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          </p>
        </div>
      </footer>
    </div>
  );
}
