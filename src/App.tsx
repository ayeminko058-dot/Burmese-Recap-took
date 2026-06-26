/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import PhoneMock from "./components/PhoneMock";
import { DownloadTask, AppNotification } from "./types";
import { AdMob, InterstitialAdPluginEvents } from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";
import { X, Sparkles } from "lucide-react";

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
  // App Launch Interstitial Ad States
  const [showLaunchAd, setShowLaunchAd] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(5);

  useEffect(() => {
    let isMounted = true;
    let timer: any = null;

    // Start 5-second countdown for the ad overlay/interstitial experience
    timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Native AdMob Interstitial triggering logic (for compiled native application contexts)
    const triggerNativeInterstitial = async () => {
      if (Capacitor.getPlatform() === "web") {
        console.log("[AppLaunchAd] Web Preview platform. High-fidelity preview overlay shown.");
        return;
      }

      try {
        console.log("[AppLaunchAd] Native Device platform. Loading Google AdMob Launch Interstitial...");
        
        // Safety initialization call
        await AdMob.initialize({
          initializeForTesting: true,
        });

        // Prepare the Interstitial with the requested Ad ID
        await AdMob.prepareInterstitial({
          adId: "ca-app-pub-3940256099942544/1033173712",
        });

        // Dismissal Event Listener setup
        const dismissListener = await AdMob.addListener(
          InterstitialAdPluginEvents.Dismissed,
          () => {
            console.log("[AppLaunchAd] Ad dismissed by user on device.");
            dismissListener.remove();
            if (isMounted) {
              setShowLaunchAd(false);
            }
          }
        );

        // Fallback handlers to ensure the user is never locked out of the app
        const failedShowListener = await AdMob.addListener(
          InterstitialAdPluginEvents.FailedToShow,
          (info) => {
            console.warn("[AppLaunchAd] Ad failed to show:", info);
            dismissListener.remove();
            failedShowListener.remove();
            if (isMounted) {
              setShowLaunchAd(false);
            }
          }
        );

        const failedLoadListener = await AdMob.addListener(
          InterstitialAdPluginEvents.FailedToLoad,
          (info) => {
            console.warn("[AppLaunchAd] Ad failed to load:", info);
            dismissListener.remove();
            failedLoadListener.remove();
            if (isMounted) {
              setShowLaunchAd(false);
            }
          }
        );

        // Show the launch ad immediately
        await AdMob.showInterstitial();
        console.log("[AppLaunchAd] Native AdMob Interstitial shown.");

      } catch (err) {
        console.error("[AppLaunchAd] Error triggering native interstitial:", err);
        // Fallback: don't block the user if AdMob native fails
      }
    };

    triggerNativeInterstitial();

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

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

      {/* FULLSCREEN APPLAUNCH INTERSTITIAL AD OVERLAY (GOOGLE ADMOB PARTNER TEST AD) */}
      {showLaunchAd && (
        <div className="fixed inset-0 z-[9999] bg-[#03070E]/95 flex items-center justify-center p-4 backdrop-blur-md">
          {/* Ad Container Box */}
          <div className="relative w-full max-w-md bg-[#0F1626] border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center overflow-hidden">
            {/* Top left corner AdMob Pill */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="text-[9px] bg-slate-800 text-slate-300 font-extrabold px-2 py-0.5 rounded border border-slate-700/50 uppercase tracking-wider select-none">
                AdMob Partner
              </span>
            </div>

            {/* Top right Skip Button / Countdown */}
            <div className="absolute top-4 right-4">
              {countdown > 0 ? (
                <div className="text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-full font-mono border border-slate-800">
                  Skip in {countdown}s
                </div>
              ) : (
                <button
                  onClick={() => setShowLaunchAd(false)}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 rounded-full transition shadow-md active:scale-95 cursor-pointer"
                >
                  Skip Ad <X size={14} />
                </button>
              )}
            </div>

            {/* Main Sponsor Ad Content */}
            <div className="mt-10 flex flex-col items-center">
              {/* Pulsing app/ad icon */}
              <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-5 relative group">
                <Sparkles className="w-10 h-10 text-white animate-pulse" />
                <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition" />
              </div>

              <h2 className="text-xl font-black text-white tracking-tight uppercase">
                Creator Toolkit Pro
              </h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">
                BURMESE RECAP SPECIALIST
              </p>

              <div className="mt-6 space-y-3.5 w-full text-left bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>10x Faster Voice Processing</strong>: Clean, high-fidelity transcription for Burmese audio files.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>Precision Character Alignment</strong>: No overlapping words, custom Burmese fonts supported natively.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-1.5 shrink-0" />
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>Universal Caption Formats</strong>: Instantly download CapCut & Premiere compatible SRT and XML subtitles.
                  </p>
                </div>
              </div>

              {/* Call to Action Button */}
              <button
                onClick={() => {
                  setShowLaunchAd(false);
                }}
                className="mt-6 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black uppercase rounded-xl transition shadow-lg shadow-blue-500/15 tracking-wider active:scale-95 cursor-pointer"
              >
                {countdown > 0 ? `Loading Features (${countdown}s)...` : "Explore Pro Benefits"}
              </button>

              <p className="text-[10px] text-slate-500 mt-3.5 select-none leading-none">
                Official Google AdMob Interstitial Ad (Test Mode)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
