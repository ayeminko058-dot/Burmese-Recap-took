import React, { useState, useEffect } from "react";
import { 
  Home, Download, Settings, Wifi, Battery, Shield, ShieldAlert, Cpu, 
  FolderOpen, Smartphone, Sparkles, Volume2, ArrowLeft, RefreshCw, X, Bell,
  Mic, FileAudio, FileVideo 
} from "lucide-react";
import { AdMob, BannerAdSize, BannerAdPosition } from "@capacitor-community/admob";
import VideoDownloader from "./VideoDownloader";
import SubtitleStudio from "./SubtitleStudio";
import TtsStudio from "./TtsStudio";
import DownloadsScreen from "./DownloadsScreen";
import SettingsScreen from "./SettingsScreen";
import Translator from "./Translator";
import { DownloadTask, AppNotification } from "../types";

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
    const initializeAdMob = async () => {
      try {
        await AdMob.initialize({
          initializeForTesting: true,
        });
        
        // Show persistent Android test Banner Ad at the bottom-center of the screen canvas
        await AdMob.showBanner({
          adId: "ca-app-pub-3940256099942544/6300978111", // Official Android Test Ad ID
          adSize: BannerAdSize.BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: true,
        });

        console.log("[AdMob] Banner loaded successfully at BOTTOM_CENTER");
      } catch (err) {
        console.warn("[AdMob] Safe initialization bypass (e.g. running on browser):", err);
      }
    };

    initializeAdMob();
  }, []);

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
          {currentScreen === "home" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 sm:pb-32 scrollbar-thin select-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                
                {/* Column 1: Info, Stats, & Live Compliance */}
                <div className="space-y-6 text-left">
                  {/* Branded Banner & Modern Card */}
                  <div className="bg-gradient-to-br from-[#121A2E]/80 to-[#0F172A]/80 border border-slate-800/80 p-6 rounded-3xl relative overflow-hidden backdrop-blur-sm shadow-xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
                    <span className="text-[9px] bg-blue-500/10 text-blue-400 py-1 px-2.5 rounded-full font-mono font-bold uppercase tracking-wider border border-blue-500/15">
                      Premium AI Creator Studio
                    </span>
                    <h1 className="text-xl font-extrabold tracking-tight text-white mt-4 leading-tight font-sans">
                      Burmese Recap Tool
                    </h1>
                    <p className="text-xs text-slate-300 leading-relaxed mt-2.5">
                      The industry-first AI-assisted narration alignment workshop tailored for Myanmar language video producers. Automatically parses Unicode syllables, aligns voice-overs, and exports flawless subtitle streams.
                    </p>
                    <div className="pt-4 flex items-center gap-4 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active Sandbox Mode</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>Chrome-optimized</span>
                      </div>
                    </div>
                  </div>

                  {/* Device Compliance Widget */}
                  <div className="bg-gradient-to-br from-[#1A2333]/75 to-[#121824]/75 border border-slate-800/80 p-5 rounded-3xl relative overflow-hidden shadow-md">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Device Compliance & Integration</span>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-[#0F172A]/80 p-3 rounded-2xl border border-slate-800/50">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${permissionGranted ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-rose-500'}`} />
                          <span className="text-xs font-medium text-slate-200">Foreground Sync Node</span>
                        </div>
                        <span className="text-[9px] text-slate-400 select-none font-mono">SDK 34 (Android 14)</span>
                      </div>
                      <div className="flex justify-between items-center bg-[#0F172A]/80 p-3 rounded-2xl border border-slate-800/50">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30" />
                          <span className="text-xs font-medium text-slate-200">CapCut SRT Connector</span>
                        </div>
                        <span className="text-[9px] text-emerald-400 select-none font-mono font-semibold uppercase">Initialized</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Three Core Interactive Studio Cards */}
                <div className="space-y-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 select-none text-left">
                    Core Studio Suites
                  </div>

                  {/* Voice to Text (Gemini) Card */}
                  <div
                    onClick={() => handlePushScreen("downloader")}
                    className="bg-indigo-950/45 border-2 border-indigo-500/20 rounded-3xl p-5 cursor-pointer shadow-[0_25px_45px_rgba(99,102,241,0.2)] hover:shadow-[0_30px_55px_rgba(99,102,241,0.55)] transition-all duration-350 hover:scale-[1.03] hover:-translate-y-1.5 hover:bg-indigo-950/60 active:scale-[0.98] group relative overflow-hidden text-left"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-start gap-4">
                      <div className="p-3.5 bg-indigo-600 text-white rounded-2xl group-hover:scale-110 transition-transform shrink-0 shadow-lg shadow-indigo-500/30">
                        <Mic className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-extrabold text-white tracking-wide group-hover:text-indigo-400 transition-colors flex flex-wrap items-center gap-1.5 font-sans">
                          <span>Voice to Text</span>
                          <span className="text-[8px] bg-indigo-500 text-white font-extrabold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                            GEMINI API REQUIRED
                          </span>
                        </h3>
                        <p className="text-xs text-slate-300 font-semibold leading-relaxed mt-2.5">
                          အသံဖိုင်နှင့် ဗီဒီယိုဖိုင်များ (MP3/WAV/MP4/MOV စသည်) မှ စာသားကို အဆင့်မြင့် Gemini API စနစ်ဖြင့် ဖတ်ယူပေးနိုင်သည်။ စာသားသီးသန့် သို့မဟုတ် စာတန်းထိုး (.SRT) ဖိုင်များကို ချက်ချင်းထုတ်ယူနိုင်သည်။
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Translator (Gemini) Card */}
                  <div
                    onClick={() => handlePushScreen("translator")}
                    className="bg-emerald-950/40 border-2 border-emerald-500/20 rounded-3xl p-5 cursor-pointer shadow-[0_25px_45px_rgba(16,185,129,0.2)] hover:shadow-[0_30px_55px_rgba(16,185,129,0.55)] transition-all duration-350 hover:scale-[1.03] hover:-translate-y-1.5 hover:bg-emerald-950/50 active:scale-[0.98] group relative overflow-hidden text-left"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-start gap-4">
                      <div className="p-3.5 bg-emerald-600 text-white rounded-2xl group-hover:scale-110 transition-transform shrink-0 shadow-lg shadow-emerald-500/30">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-extrabold text-white tracking-wide group-hover:text-emerald-450 transition-colors flex flex-wrap items-center gap-1.5 font-sans">
                          <span>Translator</span>
                          <span className="text-[8px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                            GEMINI API REQUIRED
                          </span>
                        </h3>
                        <p className="text-xs text-slate-300 font-semibold leading-relaxed mt-2.5">
                          မြန်မာစာ အပါအဝင် နိုင်ငံတကာဘာသာစကား ၁၃ မျိုးကို အလိုအလျောက် ရွေးချယ်ပြီး ဆီလျော်အောင် တိုက်ရိုက်ဘာသာပြန်ပေးနိုင်သည့် အဆင့်မြင့် Gemini Translator စနစ်။
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Subtitle Card */}
                  <div
                    onClick={() => handlePushScreen("subtitle")}
                    className="bg-[#FFF0F3]/95 border-2 border-white/65 rounded-3xl p-5 cursor-pointer shadow-[0_25px_45px_rgba(16,185,129,0.3)] hover:shadow-[0_30px_55px_rgba(16,185,129,0.55)] transition-all duration-350 hover:scale-[1.03] hover:-translate-y-1.5 hover:bg-white active:scale-[0.98] group relative overflow-hidden text-left"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-start gap-4">
                      <div className="p-3.5 bg-emerald-500 text-white rounded-2xl group-hover:scale-110 transition-transform shrink-0 shadow-lg shadow-emerald-500/30">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-extrabold text-slate-950 tracking-wide group-hover:text-emerald-600 transition-colors flex flex-wrap items-center gap-1.5">
                          <span>Premium AI Subtitle Pro</span>
                          <span className="text-[7.5px] bg-[#FFF0F3] text-rose-600 border border-rose-300/60 font-extrabold px-2.5 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                            FREE • NO API KEY REQUIRED • FOR RECAP VIDEO ONLY
                          </span>
                        </h3>
                        <p className="text-xs text-slate-800 font-medium leading-relaxed mt-2.5">
                          မြန်မာစာလုံးပေါင်း အစီအစဉ်ကို အလိုအလျောက် ညှိပေးမည့်စနစ်။ CapCut အတွက် အဖတ်ရလွယ်ကူပြီး အံကိုက်ဖြစ်စေမည့် .SRT ဖိုင်များကို ထုတ်ပေးသည်။
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* TTS Card */}
                  <div
                    onClick={() => handlePushScreen("tts")}
                    className="bg-orange-50/95 border-2 border-white/65 rounded-3xl p-5 cursor-pointer shadow-[0_25px_45px_rgba(245,158,11,0.3)] hover:shadow-[0_30px_55px_rgba(245,158,11,0.55)] transition-all duration-350 hover:scale-[1.03] hover:-translate-y-1.5 hover:bg-white active:scale-[0.98] group relative overflow-hidden text-left"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-start gap-4">
                      <div className="p-3.5 bg-orange-500 text-white rounded-2xl group-hover:scale-110 transition-transform shrink-0 shadow-lg shadow-orange-500/30">
                        <Volume2 className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-extrabold text-slate-950 tracking-wide group-hover:text-orange-600 transition-colors flex flex-wrap items-center gap-1.5">
                          <span>Text to Voice (စာသားမှ အသံပြောင်းစနစ်)</span>
                          <span className="text-[7.5px] bg-[#FFF8F0] text-orange-600 border border-orange-200/60 font-extrabold px-2.5 py-0.5 rounded-full uppercase font-mono tracking-wider whitespace-nowrap">
                            FREE • NO API KEY REQUIRED • PRO FEATURES
                          </span>
                        </h3>
                        <p className="text-xs text-slate-800 font-medium leading-relaxed mt-2.5">
                          စာလုံးရေ ၁၀,၀၀၀ ကျော်ရှိသော စာမူများကိုပါ အချိန်မရွေး အသံပြောင်းပေးနိုင်မည့်စနစ်။ သဘာဝကျပြီး အဆင့်မြင့် မြန်မာအသံထွက်များ ပါဝင်သည်။
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}

          {currentScreen === "downloader" && (
            <VideoDownloader 
              onAddNotification={onAddNotification} 
              tasks={tasks}
              setTasks={setTasks}
              onAddDownloadedFile={handleAddDownloadedFile}
              onQuickAccessSettings={() => handlePushScreen("settings")}
            />
          )}

          {currentScreen === "translator" && (
            <Translator
              onAddNotification={onAddNotification}
              onQuickAccessSettings={() => handlePushScreen("settings")}
            />
          )}

          {currentScreen === "subtitle" && (
            <SubtitleStudio 
              onAddNotification={onAddNotification}
              onAddDownloadedFile={handleAddDownloadedFile}
            />
          )}

          {currentScreen === "tts" && (
            <TtsStudio 
              onAddNotification={onAddNotification}
              onAddDownloadedFile={handleAddDownloadedFile}
            />
          )}

          {currentScreen === "downloads" && (
            <DownloadsScreen 
              files={downloadedFiles}
              onDeleteFile={handleDeleteFile}
              onAddNotification={onAddNotification}
            />
          )}

          {currentScreen === "settings" && (
            <SettingsScreen 
              onAddNotification={onAddNotification}
              permissionGranted={permissionGranted}
              onRequestPermission={triggerRequestPermissions}
            />
          )}
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR - Sticky & raised slightly to avoid system back/home gesture conflict */}
      <div className="shrink-0 bg-[#090D18] border-t border-[#1E293B] w-full z-50 pb-[24px] sm:pb-[32px] pt-1.5">
        <div className="max-w-5xl mx-auto h-16 px-12 md:px-24 flex items-center justify-between">
          <button
            onClick={() => handlePushScreen("home")}
            className={`flex flex-col items-center gap-1 focus:outline-none transition-colors ${
              bottomTab === "home" ? "text-blue-500" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[8px] font-semibold tracking-wide uppercase">Home</span>
          </button>

          <button
            onClick={() => handlePushScreen("downloads")}
            className={`flex flex-col items-center gap-1 focus:outline-none transition-colors relative ${
              bottomTab === "downloads" ? "text-blue-500" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {downloadedFiles.length > 0 && (
              <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-orange-500 text-white rounded-full text-[8px] font-bold flex items-center justify-center font-mono animate-bounce">
                {downloadedFiles.length}
              </span>
            )}
            <FolderOpen className="w-5 h-5" />
            <span className="text-[8px] font-semibold tracking-wide uppercase">Files</span>
          </button>

          <button
            onClick={() => handlePushScreen("settings")}
            className={`flex flex-col items-center gap-1 focus:outline-none transition-colors ${
              bottomTab === "settings" ? "text-blue-500" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[8px] font-semibold tracking-wide uppercase">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
