import React, { useState } from "react";
import { 
  ShieldAlert, Settings, HardDrive, Cpu, Radio, ShieldCheck, HelpCircle, Bug, Trash2
} from "lucide-react";

interface SettingsScreenProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  permissionGranted: boolean;
  onRequestPermission: () => void;
}

export default function SettingsScreen({ 
  onAddNotification, 
  permissionGranted, 
  onRequestPermission 
}: SettingsScreenProps) {
  const [targetSdk, setTargetSdk] = useState("34");
  const [defaultSpeedNode, setDefaultSpeedNode] = useState("auto");

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans" id="studio-settings">
      <div className="p-4 border-b border-[#1E293B] bg-[#0D1321] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-slate-100">Studio Settings</h2>
            <p className="text-[10px] text-slate-400">Android System Integration Controller</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#070B13]">
        {/* Play Store Runtime Permissions status panel */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-400" />
              Runtime Permission Hub
            </h3>
            <span className="text-[9px] bg-slate-800 text-slate-300 py-0.5 px-2 rounded-full font-mono font-medium">
              API {targetSdk}
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Android 14 (API 34) requires explicit media category consent. Files saved under public directories are instantaneously scanned into media galleries.
          </p>

          <div className="bg-[#0D1321] p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {permissionGranted ? (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              )}
              <div>
                <p className="text-[10px] font-bold text-slate-200">
                  {permissionGranted ? "Access Granted" : "Storage Access Restricted"}
                </p>
                <p className="text-[8px] text-slate-500">
                  {permissionGranted ? "READ_MEDIA_VIDEO/AUDIO approved" : "App requires gallery mount approval"}
                </p>
              </div>
            </div>

            <button
              onClick={onRequestPermission}
              className={`text-[9px] font-bold py-1.5 px-3 rounded-lg transition-colors ${
                permissionGranted 
                  ? "bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {permissionGranted ? "Re-evaluate" : "Grant Access"}
            </button>
          </div>
        </div>

        {/* Target OS Configuration */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-emerald-400" />
            Compliance Mode Selector
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div 
              onClick={() => {
                setTargetSdk("34");
                onAddNotification("Mode Switched", "Configuring system for Android 14+ security models", "info");
              }}
              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                targetSdk === "34" 
                  ? "bg-blue-500/10 border-blue-500/55 text-blue-300" 
                  : "bg-[#0D1321] border-slate-800 text-slate-400"
              }`}
            >
              <h4 className="text-[10px] font-bold">Android 14/15</h4>
              <p className="text-[8px] mt-0.5 opacity-80">API 34/35 Granular Media</p>
            </div>

            <div 
              onClick={() => {
                setTargetSdk("32");
                onAddNotification("Mode Switched", "Configuring system for Android 12 legacy permissions", "info");
              }}
              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                targetSdk === "32" 
                  ? "bg-blue-500/10 border-blue-500/55 text-blue-300"
                  : "bg-[#0D1321] border-slate-800 text-slate-400"
              }`}
            >
              <h4 className="text-[10px] font-bold">Legacy (A12)</h4>
              <p className="text-[8px] mt-0.5 opacity-80">API 32 general filesystem</p>
            </div>
          </div>
        </div>

        {/* Storage location metadata */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-orange-400" />
            System Directory Mapping
          </h3>

          <div className="space-y-2 text-[9px] text-slate-400">
            <div className="flex justify-between items-center bg-[#0D1321] p-2 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-500">Audio Path</span>
              <span className="text-slate-300">/storage/emulated/0/Music/Recap_TTS/</span>
            </div>
            <div className="flex justify-between items-center bg-[#0D1321] p-2 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-500">Video Path</span>
              <span className="text-slate-300">/storage/emulated/0/Download/Recap_Media/</span>
            </div>
          </div>
        </div>

        {/* Footer info block */}
        <div className="text-center py-2 opacity-50 space-y-1">
          <p className="text-[9px] text-slate-400">Burmese Recap Tool v1.0.0 (Build 5)</p>
          <p className="text-[8px] text-slate-500">© 2026 MyanmarSol Analytics Studio Ltd.</p>
        </div>
      </div>
    </div>
  );
}
