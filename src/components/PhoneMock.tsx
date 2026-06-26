import React, { useState, useEffect } from "react";
import { 
  Home, Download, Settings, Wifi, Battery, Shield, ShieldAlert, Cpu, 
  FolderOpen, Smartphone, Sparkles, Volume2, ArrowLeft, RefreshCw, X, Bell,
  Mic, FileAudio, FileVideo, AlertTriangle, Trash2, Image
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { AdMob, BannerAdSize, BannerAdPosition } from "@capacitor-community/admob";
import VideoDownloader from "./VideoDownloader";
import SubtitleStudio from "./SubtitleStudio";
import TtsStudio from "./TtsStudio";
import DownloadsScreen from "./DownloadsScreen";
import SettingsScreen from "./SettingsScreen";
import Translator from "./Translator";
import { DownloadTask, AppNotification } from "../types";
import { initializeAdMob } from "../utils/admob";

interface SavedFile {
  id: string;
  name: string;
  type: "srt" | "audio" | "video";
  timestamp: string;
  size: string;
  data: string;
  audioUrl?: string;
  url?: string;
  videoUrl?: string;
}

interface PhoneMockProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  tasks: DownloadTask[];
  setTasks: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
  downloadedFiles: SavedFile[];
  setDownloadedFiles: React.Dispatch<React.SetStateAction<SavedFile[]>>;
}

export default function PhoneMock({ 
  onAddNotification, 
  notifications, 
  setNotifications,
  tasks,
  setTasks,
  downloadedFiles,
  setDownloadedFiles
}: PhoneMockProps) {
  // Mobile app navigation state: "home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings" | "translator"
  const [currentScreen, setCurrentScreen] = useState<"home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings" | "translator">("home");
  const [lastScreen, setLastScreen] = useState<"home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings" | "translator">("home");
  const [bottomTab, setBottomTab] = useState<"home" | "downloads" | "settings">("home");
  
  // Custom dialog overlay
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    resolve: ((val: boolean) => void) | null;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isConfirm: false,
    resolve: null,
  });

  const handleDialogAction = (val: boolean) => {
    if (dialogState.resolve) {
      dialogState.resolve(val);
    }
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  useEffect(() => {
    (window as any).customAlert = (message: string, title: string = "သတိပေးချက်") => {
      return new Promise<boolean>((resolve) => {
        setDialogState({
          isOpen: true,
          title,
          message,
          isConfirm: false,
          resolve,
        });
      });
    };

    (window as any).customConfirm = (message: string, title: string = "အတည်ပြုရန်") => {
      return new Promise<boolean>((resolve) => {
        setDialogState({
          isOpen: true,
          title,
          message,
          isConfirm: true,
          resolve,
        });
      });
    };
  }, []);

  // Custom interactive permission dialog simulator
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showDenialDialog, setShowDenialDialog] = useState(false);

  // Time ticker for standard Android Bar
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Formatting to simple typical 12h clock
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      setCurrentTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const startupAdMob = async () => {
      try {
        // Global initialization of AdMob on App Mount
        await initializeAdMob();

        // If on native, trigger the real Test Banner
        if (Capacitor.getPlatform() !== "web") {
          console.log("[AdMob] Banner request started");
          await AdMob.showBanner({
            adId: "ca-app-pub-3940256099942544/6300978111", // Official Android Test Banner Ad ID
            adSize: BannerAdSize.BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: true,
          });
          console.log("[AdMob] Banner loaded successfully at BOTTOM_CENTER");
        }
      } catch (err) {
        console.warn("[AdMob] Safe initialization bypass or error during startup:", err);
      }
    };

    startupAdMob();
  }, []);

  useEffect(() => {
    let lastTimeBackPressed = 0;

    const backButtonListener = App.addListener("backButton", () => {
      if (currentScreen === "home") {
        const now = Date.now();
        if (now - lastTimeBackPressed < 2000) {
          App.exitApp();
        } else {
          lastTimeBackPressed = now;
          onAddNotification(
            "Burmese Recap Studio",
            "ထွက်ရန် နောက်တစ်ကြိမ် ထပ်နှိပ်ပါ (Press back again to exit)",
            "warning"
          );
        }
      } else {
        // Navigate back to home safely and reset bottom tabs highlights
        handlePushScreen("home");
      }
    });

    return () => {
      backButtonListener.then((listener) => listener.remove());
    };
  }, [currentScreen, lastScreen]);

  const handlePushScreen = (screen: "home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings" | "translator") => {
    setLastScreen(currentScreen);
    setCurrentScreen(screen);
    // Sync bottom active bar indicator
    if (screen === "home" || screen === "downloads" || screen === "settings") {
      setBottomTab(screen);
    }
  };

  const handleGoBack = () => {
    setCurrentScreen(lastScreen);
    if (lastScreen === "home" || lastScreen === "downloads" || lastScreen === "settings") {
      setBottomTab(lastScreen);
    }
  };

  const handleAddDownloadedFile = (name: string, data: string, type: "srt" | "audio" | "video", audioUrl?: string, url?: string) => {
    const sizeMap = {
      srt: "4 KB",
      audio: "1.2 MB",
      video: "24.5 MB"
    };
    
    const newFile: SavedFile = {
      id: `file_${Date.now()}`,
      name,
      type,
      timestamp: new Date().toLocaleDateString(),
      size: sizeMap[type],
      data,
      audioUrl,
      url: type === "video" ? data : url
    };
    setDownloadedFiles((prev) => [newFile, ...prev]);
  };

  const handleDeleteFile = (id: string) => {
    setDownloadedFiles((prev) => prev.filter((f) => f.id !== id));
    onAddNotification("File Removed", "Asset securely purged from flash cache.", "warning");
  };

  // Permission trigger handlers
  const triggerRequestPermissions = () => {
    if (permissionGranted) {
      // Toggle off to re-evaluate
      setPermissionGranted(false);
      onAddNotification("Permissions Revoked", "Active storage bridges dismantled.", "warning");
    } else {
      setShowPermissionDialog(true);
    }
  };

  const approvePermissions = () => {
    setPermissionGranted(true);
    setShowPermissionDialog(false);
    onAddNotification("Storage Granted", "Granular mediastores mounted. CapCut bridge initialized.", "success");
  };

  const declinePermissions = () => {
    setShowPermissionDialog(false);
    setShowDenialDialog(true);
  };

  return (
    <div className="w-full h-full bg-[#070B13] select-none flex flex-col font-sans relative overflow-hidden" id="web-application">
      {/* Standalone Web Application Responsive Header */}
      <header className="bg-[#0D1321] border-b border-[#1E293B] px-6 py-4 flex items-center justify-between shrink-0 select-none text-left z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-emerald-600 text-white p-2.5 rounded-2xl shadow-lg shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-tight text-white uppercase sm:text-base">
                Burmese Recap Studio
              </h1>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 py-0.5 px-2 rounded-full font-mono border border-emerald-500/15 uppercase font-bold">
                PRO AI v1.5
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5 hidden sm:block">
              Premium Universal Video Downloader • AI Subtitle Sync Aligner • Text to Voice Engine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 bg-[#121A2E] py-1.5 px-3 rounded-full border border-slate-800">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Core State: <b className="text-slate-200">Express Node</b></span>
          </div>
        </div>
      </header>

      {/* Dynamic Sliding Notifications - Premium Floating Card Style */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-2xl pointer-events-none mt-4 sm:mt-5 px-4">
        {notifications.slice(0, 1).map((notif) => (
          <div 
            key={notif.id}
            className={`shadow-2xl flex gap-3.5 items-center p-4 rounded-2xl animate-fade-in backdrop-blur-xl border-2 transition-all duration-300 pointer-events-auto ${
              notif.type === "success" 
                ? "bg-slate-900/80 border-emerald-500 text-emerald-400 shadow-emerald-500/10" 
                : notif.type === "warning"
                ? "bg-slate-900/80 border-amber-500 text-amber-400 shadow-amber-500/10"
                : "bg-slate-900/80 border-blue-500 text-blue-400 shadow-blue-500/10"
            }`}
          >
            <div className={`p-2 rounded-xl shrink-0 ${
              notif.type === "success" ? "bg-emerald-500/10 text-emerald-400" :
              notif.type === "warning" ? "bg-amber-500/10 text-amber-400" :
              "bg-blue-500/10 text-blue-400"
            }`}>
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h5 className="text-xs font-bold tracking-wide text-white">{notif.title}</h5>
              <p className="text-[10px] text-slate-200 mt-1 leading-relaxed font-medium">{notif.message}</p>
            </div>
            <button 
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
              className="p-1.5 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Native android permissions layer overlay */}
      {showPermissionDialog && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-5 animate-fade-in text-left">
          <div className="bg-[#1A2333] border border-slate-800 rounded-3xl p-5 w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100">Media Vault Sandbox</h4>
                <p className="text-[9px] text-slate-400">com.myanmarsol.burmese_recap_tool</p>
              </div>
            </div>

            <p className="text-[10px] text-slate-300 leading-relaxed">
              Allow <b>Burmese Recap Tool</b> to access dynamic media, photos, audio tracks, and save exported .SRT blocks to local shared folders?
            </p>

            <div className="flex flex-col gap-2 pt-1 font-semibold text-xs">
              <button
                onClick={approvePermissions}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl transition-colors text-center"
              >
                Allow Access (Photos & Files)
              </button>
              <button
                onClick={declinePermissions}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl transition-colors text-center"
              >
                Don't Allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Denial Help Modal */}
      {showDenialDialog && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-5 text-left animate-fade-in">
          <div className="bg-[#1D1616] border border-red-500/10 rounded-3xl p-5 w-full space-y-4 shadow-2xl">
            <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Shield className="w-4 h-4" />
              Permission Restricted
            </h4>
            <p className="text-[10px] text-slate-300 leading-relaxed">
              Without filesystem authorization, downloads and Text to Voice vocal tracks can't map into internal public folders (and won't scan into CapCut). For a production build, please allow permissions in Settings.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDenialDialog(false);
                  setShowPermissionDialog(true);
                }}
                className="flex-1 bg-red-650 hover:bg-red-600 text-white text-[10px] font-bold py-2 rounded-xl transition-colors"
              >
                Configure
              </button>
              <button
                onClick={() => setShowDenialDialog(false)}
                className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-300 text-[10px] py-1.5 rounded-xl transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN SCREEN CANVAS VIEWPORTS */}
      <div className="flex-1 mt-0 overflow-hidden flex flex-col bg-[#070B13]">
        {/* Display Back Action header if inside full screens */}
        {currentScreen !== "home" && currentScreen !== "downloads" && currentScreen !== "settings" && (
          <div className="bg-[#0D1321] px-6 py-3 border-b border-[#1E293B] flex items-center gap-1.5 shrink-0 select-none text-left">
            <button
              onClick={handleGoBack}
              className="p-1 px-2.5 rounded-lg hover:bg-slate-850 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <span className="text-slate-500 font-mono text-[10px] uppercase">/ Active Workstation</span>
          </div>
        )}

        {/* SCREEN RENDER LAYER */}
        <div className="flex-1 overflow-hidden">
          <div className="max-w-5xl mx-auto w-full h-full flex flex-col min-h-0">
            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "home" ? "" : "hidden"}`}>
              <div className="flex-1 flex flex-col min-h-0 h-full">

              {/* Scrolling Dashboard Grid */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-48 scrollbar-thin select-none">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* Column 1: Info, Stats, & Live Compliance */}
                  <div className="space-y-4 text-left">
                    {/* Branded Banner & Modern Card (Compressed by 33%) */}
                    <div className="bg-gradient-to-br from-[#121A2E]/85 to-[#0F172A]/85 border border-slate-800/80 px-4 py-3 rounded-2xl relative overflow-hidden backdrop-blur-sm shadow-xl animate-fade-in">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
                      <span className="text-[7.5px] bg-blue-500/15 text-blue-400 py-0.5 px-2 rounded-full font-mono font-bold uppercase tracking-wider border border-blue-500/15">
                        Premium AI Creator Studio
                      </span>
                      <h1 className="text-xl font-extrabold tracking-tight text-white mt-1 leading-tight font-sans">
                        Burmese Recap Tool
                      </h1>
                      <p className="text-[11px] text-slate-400 leading-tight mt-1 font-normal">
                        The industry-first AI-assisted narration alignment workshop tailored for Myanmar language video producers. Automatically parses Unicode syllables, aligns voice-overs, and exports flawless subtitle streams.
                      </p>
                      <div className="pt-2 flex items-center gap-2.5 text-[8px] text-slate-500">
                        <div className="flex items-center gap-1 bg-[#0F172A]/90 px-1.5 py-0.5 rounded-md border border-slate-800/50">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Active Sandbox</span>
                        </div>
                        <div className="flex items-center gap-1 bg-[#0F172A]/90 px-1.5 py-0.5 rounded-md border border-slate-800/50">
                          <span className="w-1 h-1 rounded-full bg-blue-500" />
                          <span>Chrome-optimized</span>
                        </div>
                      </div>
                    </div>

                    {/* Device Compliance Widget (Compressed by 33%) */}
                    <div className="bg-gradient-to-br from-[#1A2333]/75 to-[#121824]/75 border border-slate-800/80 p-2.5 rounded-2xl relative overflow-hidden shadow-md mt-0">
                      <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Device Compliance & Integration</span>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center bg-[#0F172A]/80 py-1 px-2 rounded-xl border border-slate-800/50">
                          <div className="flex items-center gap-1">
                            <span className={`w-1 h-1 rounded-full ${permissionGranted ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="text-[9px] font-bold text-slate-350">Foreground Sync Node</span>
                          </div>
                          <span className="text-[6.5px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold">SDK 34</span>
                        </div>
                        <div className="flex justify-between items-center bg-[#0F172A]/80 py-1 px-2 rounded-xl border border-slate-800/50">
                          <div className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            <span className="text-[9px] font-bold text-slate-350">CapCut SRT Connector</span>
                          </div>
                          <span className="text-[6.5px] bg-emerald-950/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Initialized</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Three Core Interactive Studio Cards */}
                  <div className="space-y-2.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 select-none text-left">
                      Core Studio Suites
                    </div>

                    {/* Voice to Text (Gemini) Card */}
                    <div
                      onClick={() => handlePushScreen("downloader")}
                      className="bg-indigo-950/45 border-2 border-indigo-500/15 rounded-2xl p-3 cursor-pointer shadow-[0_12px_24px_rgba(99,102,241,0.1)] hover:shadow-[0_18px_32px_rgba(99,102,241,0.3)] transition-all duration-300 hover:scale-[1.015] hover:bg-indigo-950/60 active:scale-[0.985] group relative overflow-hidden text-left"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-600 text-white rounded-xl group-hover:scale-105 transition-transform shrink-0 shadow-md shadow-indigo-500/20">
                          <Mic className="w-4 h-4" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-white tracking-wide group-hover:text-indigo-400 transition-colors flex items-center justify-between gap-1.5 font-sans">
                            <span>Voice to Text</span>
                            <span className="text-[7px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-bold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                              GEMINI API
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-300 font-normal leading-relaxed mt-1 line-clamp-2 h-8 overflow-hidden">
                            အသံဖိုင်နှင့် ဗီဒီယိုဖိုင်များမှ စာသားကို အဆင့်မြင့် Gemini API စနစ်ဖြင့် ဖတ်ယူပေးနိုင်သည်။ စာသားသီးသန့် သို့မဟုတ် စာတန်းထိုး (.SRT) ဖိုင်များကို ချက်ချင်းထုတ်ယူနိုင်သည်။
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Translator (Gemini) Card */}
                    <div
                      onClick={() => handlePushScreen("translator")}
                      className="bg-emerald-950/40 border-2 border-emerald-500/15 rounded-2xl p-3 cursor-pointer shadow-[0_12px_24px_rgba(16,185,129,0.1)] hover:shadow-[0_18px_32px_rgba(16,185,129,0.3)] transition-all duration-300 hover:scale-[1.015] hover:bg-emerald-950/50 active:scale-[0.985] group relative overflow-hidden text-left"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-emerald-600 text-white rounded-xl group-hover:scale-105 transition-transform shrink-0 shadow-md shadow-emerald-500/20">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-white tracking-wide group-hover:text-emerald-400 transition-colors flex items-center justify-between gap-1.5 font-sans">
                            <span>Translator</span>
                            <span className="text-[7px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-bold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                              GEMINI API
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-300 font-normal leading-relaxed mt-1 line-clamp-2 h-8 overflow-hidden">
                            မြန်မာစာ အပါအဝင် နိုင်ငံတကာဘာသာစကား ၁၃ မျိုးကို အလိုအလျောက် ရွေးချယ်ပြီး ဆီလျော်အောင် တိုက်ရိုက်ဘာသာပြန်ပေးနိုင်သည့် အဆင့်မြင့် Gemini Translator စနစ်။
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Subtitle Card */}
                    <div
                      onClick={() => handlePushScreen("subtitle")}
                      className="bg-slate-900/40 border-2 border-cyan-500/20 rounded-2xl p-3 cursor-pointer shadow-[0_12px_24px_rgba(6,182,212,0.06)] hover:shadow-[0_18px_32px_rgba(6,182,212,0.2)] transition-all duration-300 hover:scale-[1.015] hover:bg-slate-900/60 active:scale-[0.985] group relative overflow-hidden text-left"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-xl group-hover:scale-105 transition-transform shrink-0 shadow-sm shadow-cyan-500/10">
                          <Sparkles className="w-4 h-4 animate-pulse" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-white tracking-wide group-hover:text-cyan-400 transition-colors flex items-center justify-between gap-1.5 font-sans">
                            <span>AI Subtitle Pro</span>
                            <span className="text-[7px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 font-bold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                              FREE • COMPLIANT
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-300 font-normal leading-relaxed mt-1 line-clamp-2 h-8 overflow-hidden">
                            မြန်မာစာလုံးပေါင်း အစီအစဉ်ကို အလိုအလျောက် ညှိပေးမည့်စနစ်။ CapCut အတွက် အဖတ်ရလွယ်ကူပြီး အံကိုက်ဖြစ်စေမည့် .SRT ဖိုင်များကို ထုတ်ပေးသည်။
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* TTS Card */}
                    <div
                      onClick={() => handlePushScreen("tts")}
                      className="bg-zinc-900/40 border-2 border-orange-500/20 rounded-2xl p-3 cursor-pointer shadow-[0_12px_24px_rgba(245,158,11,0.06)] hover:shadow-[0_18px_32px_rgba(245,158,11,0.2)] transition-all duration-300 hover:scale-[1.015] hover:bg-zinc-900/60 active:scale-[0.985] group relative overflow-hidden text-left"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-orange-600/20 text-orange-400 border border-orange-500/35 rounded-xl group-hover:scale-105 transition-transform shrink-0 shadow-sm shadow-orange-500/10">
                          <Volume2 className="w-4 h-4" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-white tracking-wide group-hover:text-orange-400 transition-colors flex items-center justify-between gap-1.5 font-sans">
                            <span>Text to Voice</span>
                            <span className="text-[7px] bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                              FREE • PRO ACCESS
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-300 font-normal leading-relaxed mt-1 line-clamp-2 h-8 overflow-hidden">
                            စာလုံးရေ ၁၀,၀၀0 ကျော်ရှိသော စာမူများကိုပါ အချိန်မရွေး အသံပြောင်းပေးနိုင်မည့်စနစ်။ သဘာဝကျပြီး အဆင့်မြင့် မြန်မာအသံထွက်များ ပါဝင်သည်။
                          </p>
                        </div>
                      </div>
                    </div>



                  </div>

                </div>
              </div>
            </div>
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "downloader" ? "" : "hidden"}`}>
            <VideoDownloader 
              onAddNotification={onAddNotification} 
              tasks={tasks}
              setTasks={setTasks}
              onAddDownloadedFile={handleAddDownloadedFile}
              onQuickAccessSettings={() => handlePushScreen("settings")}
            />
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "translator" ? "" : "hidden"}`}>
            <Translator
              onAddNotification={onAddNotification}
              onQuickAccessSettings={() => handlePushScreen("settings")}
            />
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "subtitle" ? "" : "hidden"}`}>
            <SubtitleStudio 
              onAddNotification={onAddNotification}
              onAddDownloadedFile={handleAddDownloadedFile}
              isActive={currentScreen === "subtitle"}
            />
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "tts" ? "" : "hidden"}`}>
            <TtsStudio 
              onAddNotification={onAddNotification}
              onAddDownloadedFile={handleAddDownloadedFile}
              isActive={currentScreen === "tts"}
            />
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "downloads" ? "" : "hidden"}`}>
            <DownloadsScreen 
              files={downloadedFiles}
              onDeleteFile={handleDeleteFile}
              onAddNotification={onAddNotification}
            />
            </div>

            <div className={`flex-1 min-h-0 h-full flex flex-col ${currentScreen === "settings" ? "" : "hidden"}`}>
            <SettingsScreen 
              onAddNotification={onAddNotification}
              permissionGranted={permissionGranted}
              onRequestPermission={triggerRequestPermissions}
            />
            </div>


          </div>
        </div>
      </div>

      {/* BOTTOM PERSISTENT REGION - Floating elegantly with Safe Area bottom spacing */}
      <div className="absolute bottom-0 left-0 right-0 z-50 pointer-events-none flex flex-col items-center gap-2 px-4 pb-[calc(14px+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] select-none">



        {/* PREMIUM FLOATING GLASSMORPHIC BOTTOM NAVIGATION BAR - RE-INDEXED WITH SOLID BACKGROUND */}
        <div className="w-full max-w-sm bg-[#0D1321] border border-slate-800/80 rounded-2xl pointer-events-auto shadow-[0_12px_40px_rgba(0,0,0,0.8)] py-3 px-6 flex items-center justify-between shrink-0 z-50">
          <button
            onClick={() => handlePushScreen("home")}
            className={`flex-1 flex flex-col items-center gap-1.5 focus:outline-none transition-all duration-300 ${
              bottomTab === "home" 
                ? "text-blue-400 scale-105 filter drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" 
                : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <Home className="w-5.5 h-5.5" />
            <span className="text-[9px] font-extrabold tracking-wide uppercase font-sans">Home</span>
          </button>

          <button
            onClick={() => handlePushScreen("downloads")}
            className={`flex-1 flex flex-col items-center gap-1.5 focus:outline-none transition-all duration-300 relative ${
              bottomTab === "downloads" 
                ? "text-blue-400 scale-105 filter drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" 
                : "text-slate-500 hover:text-slate-350"
            }`}
          >
            {downloadedFiles.length > 0 && (
              <span className="absolute -top-1 right-[20%] w-4.5 h-4.5 bg-orange-500 text-white rounded-full text-[8.5px] font-black flex items-center justify-center font-mono animate-bounce z-10 shadow-md">
                {downloadedFiles.length}
              </span>
            )}
            <FolderOpen className="w-5.5 h-5.5" />
            <span className="text-[9px] font-extrabold tracking-wide uppercase font-sans">Files</span>
          </button>

          <button
            onClick={() => handlePushScreen("settings")}
            className={`flex-1 flex flex-col items-center gap-1.5 focus:outline-none transition-all duration-300 ${
              bottomTab === "settings" 
                ? "text-blue-400 scale-105 filter drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" 
                : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <Settings className="w-5.5 h-5.5" />
            <span className="text-[9px] font-extrabold tracking-wide uppercase font-sans">Settings</span>
          </button>
        </div>
      </div>

      {/* CUSTOM HIGH-FIDELITY MOBILE DIALOG BOX */}
      {dialogState.isOpen && (
        <div className="absolute inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5 select-none animate-fade-in">
          <div className="bg-[#0F172A] border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative overflow-hidden animate-scale-up text-center">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
            
            {/* Modal Icon Header */}
            <div className="mx-auto w-12 h-12 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-5 h-5" />
            </div>

            {/* Modal Title */}
            <h3 className="text-base font-bold text-white tracking-wide mb-2.5">
              {dialogState.title}
            </h3>

            {/* Modal Content Message */}
            <p className="text-xs text-slate-300 leading-relaxed mb-6 whitespace-pre-wrap">
              {dialogState.message}
            </p>

            {/* Modal Action Buttons */}
            <div className="flex items-center gap-3 justify-center">
              {dialogState.isConfirm ? (
                <>
                  <button
                    onClick={() => handleDialogAction(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-755 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all"
                  >
                    မလုပ်တော့ပါ
                  </button>
                  <button
                    onClick={() => handleDialogAction(true)}
                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all shadow-blue-500/20"
                  >
                    သဘောတူသည်
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleDialogAction(true)}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all shadow-blue-500/20"
                >
                  ကောင်းပါပြီ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
