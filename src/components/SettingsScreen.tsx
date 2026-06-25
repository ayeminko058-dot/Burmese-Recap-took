import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, Settings, HardDrive, Cpu, Radio, ShieldCheck, HelpCircle, Bug, Trash2,
  Key, RefreshCw, Eye, EyeOff, Loader2, AlertCircle
} from "lucide-react";
import { getApiUrl } from "../utils/api";

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
  
  // Gemini Key credentials states
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [apiKeySet, setApiKeySet] = useState<boolean>(false);
  const [validationStatus, setValidationStatus] = useState<"idle" | "validating" | "valid" | "unconfigured" | "invalid">("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load API key from local storage on component mount
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key") || "";
    setApiKey(savedKey);
    setApiKeySet(!!savedKey);
    if (savedKey) {
      setValidationStatus("valid");
    } else {
      setValidationStatus("unconfigured");
    }
  }, []);

  const handleSaveKey = () => {
    if (!apiKey.trim()) {
      onAddNotification("API Key Required", "Please enter or paste your Gemini key first.", "warning");
      return;
    }
    localStorage.setItem("gemini_api_key", apiKey.trim());
    setApiKeySet(true);
    setValidationStatus("idle");
    onAddNotification("API Key Saved", "Gemini API key saved to device local storage successfully.", "success");
    
    // Dispatch storage event to sync other loaded modules
    window.dispatchEvent(new Event("storage"));
  };

  const handleClearKey = () => {
    localStorage.removeItem("gemini_api_key");
    setApiKey("");
    setApiKeySet(false);
    setValidationStatus("unconfigured");
    setValidationError(null);
    onAddNotification("API Key Erased", "Key securely purged from local storage.", "warning");
    
    // Dispatch storage event
    window.dispatchEvent(new Event("storage"));
  };

  const handleValidateKey = async () => {
    const keyToValidate = apiKey.trim();
    if (!keyToValidate) {
      onAddNotification("API Key Required", "Please provide a key credentials string to validate.", "warning");
      return;
    }

    setValidationStatus("validating");
    setValidationError(null);

    try {
      const response = await fetch(getApiUrl("/api/validate-key"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": keyToValidate
        }
      });
      
      const contentType = response.headers.get("content-type");
      let data: any = {};
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json().catch(() => ({}));
      } else {
        const rawText = await response.text().catch(() => "");
        if (rawText.includes("Unexpected token") || rawText.includes("504") || rawText.includes("timeout") || rawText.startsWith("T") || rawText.includes("Gateway")) {
          throw new Error("တောင်းဆိုမှု ကြာမြင့်နေပါသည်။ ခဏအကြာမှ ပြန်လည်ကြိုးစားပေးပါ။");
        }
        throw new Error(rawText.substring(0, 100) || "Server error.");
      }

      if (response.ok && data.valid) {
        setValidationStatus("valid");
        onAddNotification("API key verified", "Gemini validation handshake passed.", "success");
      } else {
        setValidationStatus("invalid");
        setValidationError(data.error || "Handshake rejected by Google servers. Confirm your key credentials.");
        onAddNotification("Handshake failed", "Google rejected the selected credentials.", "warning");
      }
    } catch (err: any) {
      console.error(err);
      setValidationStatus("invalid");
      setValidationError(err.message || "Could not complete network verification handshake.");
      onAddNotification("Handshake failure", "Validation connection interrupted.", "warning");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans" id="studio-settings">
      <div className="p-4 border-b border-[#1E293B] bg-[#0D1321] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-850 text-slate-300">
            <Settings className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold tracking-wide text-slate-100">Studio Settings</h2>
            <p className="text-[10px] text-slate-400">Android System Integration Controller</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-40 space-y-4 bg-[#070B13]">
        
        {/* Dedicated Gemini API key Settings section */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between select-none">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-indigo-400 animate-pulse" />
              Gemini API Controller
            </h3>
            <span className="text-[9px] bg-slate-850 text-indigo-400 py-0.5 px-2.5 rounded-full font-mono font-bold uppercase tracking-wider border border-indigo-500/10">
              API CREDENTIAL
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed font-sans text-left">
            "Your Gemini API Key is stored locally inside this app on your device only. The app does not upload, store, collect, or save your API key on any external server. Your key is used only to communicate directly with Google's Gemini API."
          </p>

          <div className="space-y-3 font-medium select-none">
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste AI Studio API Key..."
                className="bg-transparent text-xs text-white flex-1 px-1.5 outline-none font-mono placeholder-slate-700 select-text"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Storage status visualizer */}
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
              <span>Secure Storage Status:</span>
              {apiKeySet ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Stored locally
                </span>
              ) : (
                <span className="text-amber-500 font-bold">Not configured</span>
              )}
            </div>

            {/* Actions deck buttons */}
            <div className="grid grid-cols-2 gap-2 text-xs select-none">
              <button
                type="button"
                onClick={handleSaveKey}
                className="bg-indigo-650 hover:bg-indigo-600 border border-indigo-550/20 text-white text-[10px] font-bold py-2 rounded-xl transition duration-150 active:scale-95 text-center cursor-pointer"
              >
                {apiKeySet ? "Update Key" : "Save Key"}
              </button>
              
              <button
                type="button"
                onClick={handleValidateKey}
                disabled={validationStatus === "validating" || !apiKey}
                className={`text-[10px] py-1.5 rounded-xl border font-bold flex items-center justify-center gap-1 transition-all duration-150 text-center ${
                  validationStatus === "validating"
                    ? "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
                    : validationStatus === "valid"
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 cursor-pointer"
                    : "bg-[#0D1321] border-slate-850 text-slate-300 hover:border-slate-700 cursor-pointer"
                }`}
              >
                {validationStatus === "validating" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                )}
                <span>Check Status</span>
              </button>
            </div>

            {apiKeySet && (
              <button
                type="button"
                onClick={handleClearKey}
                className="w-full text-center text-[9px] text-rose-450 hover:text-rose-400 font-mono tracking-wider font-semibold uppercase block pt-1 hover:blur-none"
              >
                Erase configured keys from cache
              </button>
            )}

            {validationError && (
              <div className="bg-rose-500/15 border border-rose-500/25 p-3 text-[9.5px] text-rose-300 rounded-xl leading-relaxed select-text font-mono break-all font-semibold max-w-full">
                Error log: {validationError}
              </div>
            )}
          </div>
        </div>

        {/* Play Store Runtime Permissions status panel */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between select-none">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-400 animate-pulse" />
              Runtime Permission Hub
            </h3>
            <span className="text-[9px] bg-slate-850 text-slate-300 py-0.5 px-2.5 rounded-full font-mono font-semibold">
              API {targetSdk}
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed text-left">
            Android 14 (API 34) requires explicit media category consent. Files saved under public directories are instantaneously scanned into media galleries.
          </p>

          <div className="bg-[#0D1321] p-3 rounded-xl border border-slate-800/80 flex items-center justify-between select-none">
            <div className="flex items-center gap-2.5">
              {permissionGranted ? (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              )}
              <div className="text-left">
                <p className="text-[10px] font-bold text-slate-200">
                  {permissionGranted ? "Access Granted" : "Storage Access Restricted"}
                </p>
                <p className="text-[8px] text-slate-500 mt-0.5">
                  {permissionGranted ? "READ_MEDIA_VIDEO/AUDIO approved" : "App requires gallery mount approval"}
                </p>
              </div>
            </div>

            <button
              onClick={onRequestPermission}
              className={`text-[9.5px] font-bold py-1.5 px-3 rounded-lg transition-colors select-none ${
                permissionGranted 
                  ? "bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-300"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {permissionGranted ? "Re-evaluate" : "Grant Access"}
            </button>
          </div>
        </div>

        {/* Storage location metadata */}
        <div className="bg-[#1A2333]/90 border border-slate-800 rounded-2xl p-4 space-y-3 select-none">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-orange-400 animate-pulse" />
            System Directory Mapping
          </h3>

          <div className="space-y-2 text-[9px] text-slate-400 text-left">
            <div className="flex justify-between items-center bg-[#0D1321] p-2.5 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-500">Audio Path</span>
              <span className="text-slate-300">/storage/emulated/0/Music/Recap_TTS/</span>
            </div>
            <div className="flex justify-between items-center bg-[#0D1321] p-2.5 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-500">Video Path</span>
              <span className="text-slate-300">/storage/emulated/0/Download/Recap_Media/</span>
            </div>
          </div>
        </div>

        {/* Footer info block */}
        <div className="text-center py-2 opacity-50 space-y-1 select-none">
          <p className="text-[9px] text-slate-400">Burmese Recap Tool v1.0.0 (Build 5)</p>
          <p className="text-[8px] text-slate-500">© 2026 MyanmarSol Analytics Studio Ltd.</p>
        </div>
      </div>
    </div>
  );
}
