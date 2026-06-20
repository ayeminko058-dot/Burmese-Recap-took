import React, { useState, useEffect } from "react";
import { 
  Home, Download, Settings, Wifi, Battery, Shield, ShieldAlert, Cpu, 
  FolderOpen, Smartphone, Sparkles, Volume2, ArrowLeft, RefreshCw, X, Bell 
} from "lucide-react";
import VideoDownloader from "./VideoDownloader";
import SubtitleStudio from "./SubtitleStudio";
import TtsStudio from "./TtsStudio";
import DownloadsScreen from "./DownloadsScreen";
import SettingsScreen from "./SettingsScreen";
import { DownloadTask, AppNotification } from "../types";

interface SavedFile {
  id: string;
  name: string;
  type: "srt" | "audio" | "video";
  timestamp: string;
  size: string;
  data: string;
  audioUrl?: string;
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
  // Mobile app navigation state: "home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings"
  const [currentScreen, setCurrentScreen] = useState<"home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings">("home");
  const [lastScreen, setLastScreen] = useState<"home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings">("home");
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

  const handlePushScreen = (screen: "home" | "downloader" | "subtitle" | "tts" | "downloads" | "settings") => {
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

  const handleAddDownloadedFile = (name: string, data: string, type: "srt" | "audio" | "video", audioUrl?: string) => {
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
      audioUrl
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
    <div className="relative mx-auto my-4 w-[370px] h-[780px] bg-[#070B13] rounded-[48px] border-[10px] border-slate-900 shadow-3xl overflow-hidden ring-4 ring-slate-800/40 select-none flex flex-col font-sans mb-[25px]" id="mobile-viewport">
      {/* Phone Notch Screen Integration */}
      <div className="absolute top-0 inset-x-0 h-7 bg-black z-50 flex justify-between items-center px-6">
        {/* Notch elements */}
        <div className="text-[10px] font-bold text-slate-300 font-mono select-none">{currentTime}</div>
        
        {/* Visual camera lens */}
        <div className="w-18 h-4.5 bg-[#0D1321] rounded-full flex items-center justify-center border border-slate-900">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-950 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-blue-900/60" />
          </div>
        </div>

        {/* Status icons right */}
        <div className="flex items-center gap-1.5 text-slate-300">
          <Wifi className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[8px] font-mono font-medium text-emerald-400">5G</span>
          <Battery className="w-4 h-4 text-emerald-500 fill-current" />
        </div>
      </div>

      {/* Dynamic Sliding Notifications */}
      <div className="absolute top-8 inset-x-3 z-[100] pointer-events-none space-y-1.5 max-h-[160px] overflow-hidden">
        {notifications.slice(0, 2).map((notif) => (
          <div 
            key={notif.id}
            className={`shadow-2xl border flex gap-2.5 items-center p-3 rounded-2xl animate-fade-in backdrop-blur-md transition-all duration-300 ${
              notif.type === "success" 
                ? "bg-slate-900/90 border-emerald-500/25 text-emerald-400" 
                : notif.type === "warning"
                ? "bg-slate-900/90 border-amber-500/25 text-amber-400"
                : "bg-slate-900/90 border-blue-500/25 text-blue-400"
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0 animate-bounce" />
            <div className="flex-1 min-w-0">
              <h5 className="text-[10px] font-bold truncate tracking-wide text-slate-100">{notif.title}</h5>
              <p className="text-[8px] text-slate-300 truncate mt-0.5">{notif.message}</p>
            </div>
            <button 
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
              className="pointer-events-auto p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
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
              Without filesystem authorization, downloads and TTS vocal tracks can't map into internal public folders (and won't scan into CapCut). For a production build, please allow permissions in Settings.
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
      <div className="flex-1 mt-7 overflow-hidden flex flex-col bg-[#070B13]">
        {/* Display Back Action header if inside full screens */}
        {currentScreen !== "home" && currentScreen !== "downloads" && currentScreen !== "settings" && (
          <div className="bg-[#0D1321] px-3 py-2.5 border-b border-[#1E293B] flex items-center gap-1 shrink-0 select-none text-left">
            <button
              onClick={handleGoBack}
              className="p-1 rounded-lg hover:bg-slate-850 text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-bold text-slate-300">Exit Studio Workspace</span>
          </div>
        )}

        {/* SCREEN RENDER LAYER */}
        <div className="flex-1 overflow-hidden">
          {currentScreen === "home" && (
            <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5 scrollbar-thin select-none">
              {/* Branded Banner */}
              <div className="text-left mt-1">
                <span className="text-[9px] bg-blue-500/10 text-blue-400 py-0.5 px-2 rounded-full font-mono font-bold uppercase tracking-wider">
                  Premium AI Creator Studio
                </span>
                <h1 className="text-base font-extrabold tracking-tight text-white mt-1.5 leading-tight font-sans">
                  Burmese Recap Tool
                </h1>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                  Optimize vocal alignment and narrative speed overlays for YouTube and TikTok.
                </p>
              </div>

              {/* THREE CORE INTERACTIVE STUDIO CARDS */}
              <div className="space-y-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest pl-0.5 select-none text-left">
                  Core Studio Suites
                </div>

                {/* Downloader Card */}
                <div
                  onClick={() => handlePushScreen("downloader")}
                  className="bg-gradient-to-br from-[#121824] to-[#1A2333]/90 border border-slate-800/80 rounded-3xl p-4 cursor-pointer transition-all duration-350 hover:bg-[#1E293B] hover:border-blue-500 hover:shadow-lg hover:shadow-blue-950/15 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl group-hover:scale-105 transition-transform shrink-0">
                      <Download className="w-5 h-5 animate-bounce" style={{ animationDuration: '3s' }} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xs font-bold text-slate-200 tracking-wide group-hover:text-blue-400 transition-colors">
                        Universal Downloader
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Instant video downloads upon pasting links. Multi-queue background thread simulation.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subtitle Card */}
                <div
                  onClick={() => handlePushScreen("subtitle")}
                  className="bg-gradient-to-br from-[#121824] to-[#1A2333]/90 border border-slate-800/80 rounded-3xl p-4 cursor-pointer transition-all duration-350 hover:bg-[#1E293B] hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-950/15 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors" />
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl group-hover:scale-105 transition-transform shrink-0">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xs font-bold text-slate-200 tracking-wide group-hover:text-emerald-400 transition-colors">
                        Premium AI Subtitle
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Unicode Burmese syllable aligner. Outputs perfect-phrased .SRT timelines for CapCut.
                      </p>
                    </div>
                  </div>
                </div>

                {/* TTS Card */}
                <div
                  onClick={() => handlePushScreen("tts")}
                  className="bg-gradient-to-br from-[#121824] to-[#1A2333]/90 border border-slate-800/80 rounded-3xl p-4 cursor-pointer transition-all duration-350 hover:bg-[#1E293B] hover:border-orange-500 hover:shadow-lg hover:shadow-orange-950/15 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-colors" />
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-orange-500/10 text-orange-400 rounded-2xl group-hover:scale-105 transition-transform shrink-0">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xs font-bold text-slate-200 tracking-wide group-hover:text-orange-400 transition-colors">
                        Ultra Long-Form TTS
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                        Convert 10,000+ character scripts without timeouts. High-fidelity Myanmar voices.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status checklist widget */}
              <div className="bg-[#1A2333]/90 border border-slate-800/80 p-3.5 rounded-[24px] text-left">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Device Compliance</span>
                <div className="flex justify-between items-center mt-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${permissionGranted ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-[10px] text-slate-300">Foreground Sync Node</span>
                  </div>
                  <span className="text-[8px] text-slate-500 select-none font-mono">SDK 34 (Android 14)</span>
                </div>
              </div>
            </div>
          )}

          {currentScreen === "downloader" && (
            <VideoDownloader 
              onAddNotification={onAddNotification} 
              tasks={tasks}
              setTasks={setTasks}
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

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="h-16 bg-[#090D18] border-t border-[#1E293B] px-6 flex items-center justify-between shrink-0 z-50">
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
  );
}
