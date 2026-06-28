import React, { useState, useRef, useEffect } from "react";
import { 
  Volume2, Play, Pause, Download, Disc, Sparkles, RefreshCw, CheckCircle, AlertTriangle 
} from "lucide-react";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { triggerInterstitialAd } from "../utils/admob";
import { getApiUrl, safeFetch } from "../utils/api";
import { VoiceOption } from "../types";

export const VOICE_MATRIX: VoiceOption[] = [
  { code: "my-MM-NilarNeural", name: "MM Nilar (Female HQ)", language: "Myanmar", flag: "🇲🇲" },
  { code: "my-MM-ThihaNeural", name: "MM Thiha (Male HQ)", language: "Myanmar", flag: "🇲🇲" },
  { code: "en-US-JennyNeural", name: "EN Jenny (Female Fluid)", language: "US English", flag: "🇺🇸" },
  { code: "en-US-GuyNeural", name: "EN Guy (Male Soft)", language: "US English", flag: "🇺🇸" },
  { code: "th-TH-PremwadeeNeural", name: "TH Premwadee (Narrative)", language: "Thai", flag: "🇹🇭" },
  { code: "zh-CN-XiaoxiaoNeural", name: "ZH Xiaoxiao (Warm)", language: "Chinese", flag: "🇨🇳" },
  { code: "ko-KR-SunHiNeural", name: "KO Sun-Hi (Vibrant)", language: "Korean", flag: "🇰🇷" }
];

interface TtsStudioProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  onAddDownloadedFile: (name: string, data: string, type: "srt" | "audio" | "video", audioUrl?: string) => void;
  isActive?: boolean;
}

export default function TtsStudio({ onAddNotification, onAddDownloadedFile, isActive = true }: TtsStudioProps) {
  const [text, setText] = useState(
    "ပရိသတ်ကြီးခင်ဗျာ။ ယနေ့ တင်ဆက်ပေးမယ့် ဇာတ်ကားကတော့ နာမည်ကျော် မင်းသားကြီးရဲ့ ဂန္ထဝင် စွန့်စားခန်း ဇာတ်လမ်းတစ်ပုဒ်ပဲ ဖြစ်ပါတယ်။ နောက်ဆုံးအချိန်အထိ စိတ်လှုပ်ရှားစွာနဲ့ ကြည့်ရှုရမှာမို့ ဗီဒီယိုလေးကို Like and Subbed လုပ်ပေးခဲ့ကြပါဦး။"
  );
  const [selectedVoice, setSelectedVoice] = useState("my-MM-NilarNeural");
  const [selectedStyle, setSelectedStyle] = useState("general");
  
  // Rebuild the UI with precise states: 'idle' | 'loading' | 'success' | 'failure'
  const [synthesisState, setSynthesisState] = useState<"idle" | "loading" | "success" | "failure">("idle");
  const [progressLog, setProgressLog] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [syncedAudioUrl, setSyncedAudioUrl] = useState<string | null>(null);
  const [vocalBase64, setVocalBase64] = useState<string>("");
  const [audioPlayState, setAudioPlayState] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const compiledBlobRef = useRef<Blob | null>(null);

  // Clean up Object URL on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (syncedAudioUrl && syncedAudioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(syncedAudioUrl);
      }
    };
  }, [syncedAudioUrl]);

  const triggerAlert = async (message: string, title: string = "ဒေါင်းလုဒ်အခြေအနေ") => {
    if (typeof (window as any).customAlert === "function") {
      await (window as any).customAlert(message, title);
    } else {
      alert(message);
    }
  };

  const charCount = text.length;
  const chunkEstimate = Math.ceil(charCount / 180);

  // Convert ArrayBuffer to Base64 in a fast, mobile-friendly standard implementation
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleSynthesizeTts = async () => {
    if (!text.trim()) return;

    setSynthesisState("loading");
    setErrorMessage(null);
    setAudioPlayState(false);
    setSyncedAudioUrl(null);
    setVocalBase64("");
    setProgressLog("Analyzing Burmese syntax clauses...");

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setProgressLog("Submitting script to high-speed synthesizer...");

      const generateVoiceApiUrl = getApiUrl("/api/generate-voice");
      
      const response = await safeFetch(generateVoiceApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          style: selectedStyle,
        })
      });

      const contentType = response.headers.get("content-type") || "";
      
      if (!response.ok) {
        // If server failed, try to parse JSON error message
        let errorMsg = "Server Network Error: Failed to generate audio track.";
        if (contentType.includes("application/json")) {
          const errData = await response.json();
          errorMsg = errData?.error?.message || errorMsg;
        } else {
          const rawText = await response.text();
          if (rawText.startsWith("<!doctype") || rawText.startsWith("<html")) {
            throw new Error(`Server Network Error: Expected JSON, but received HTML error page. Content snippet: ${rawText.slice(0, 300)}`);
          }
        }
        throw new Error(errorMsg);
      }

      setProgressLog("Processing generated audio metadata...");
      const result = await response.json();

      if (!result.success || !result.audioUrl) {
        throw new Error(result.error?.message || "Vocal synthesis pipeline failed on server.");
      }

      setProgressLog("Setting up streaming audio track...");
      setVocalBase64(result.base64Data || "");

      // Store blob ref for compatibility (reconstruct from Base64 fallback if needed)
      if (result.base64Data) {
        try {
          const byteCharacters = atob(result.base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          compiledBlobRef.current = new Blob([byteArray], { type: "audio/mpeg" });
        } catch (e) {
          console.warn("[TtsStudio] Failed to build compiledBlobRef from base64 fallback:", e);
        }
      }

      const streamUrl = getApiUrl(result.audioUrl);
      setSyncedAudioUrl(streamUrl);
      setSynthesisState("success");
      setProgressLog("");

      onAddNotification(
        "Vocal Track Generated",
        "Synthesized Burmese speech successfully. Preparing audio...",
        "success"
      );

      // Register inside files list
      const fileName = `TTS_Voice_${Date.now().toString().slice(-4)}.mp3`;
      onAddDownloadedFile(fileName, "BINARY_MP3_STREAM", "audio", streamUrl);

      // Trigger automatic bypass of mobile play restrictions
      setTimeout(() => {
        if (audioRef.current) {
          try {
            audioRef.current.load();
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  setAudioPlayState(true);
                })
                .catch((playErr) => {
                  console.warn("[TtsStudio] Autoplay gesture restriction occurred:", playErr);
                  setAudioPlayState(false);
                });
            }
          } catch (e) {
            console.warn("[TtsStudio] Trigger load/play exception ignored:", e);
          }
        }
      }, 200);

    } catch (err: any) {
      console.error("[TtsStudio Synthesis Error]:", err);
      const displayErr = err.message || "Please verify internet connection or API settings.";
      setErrorMessage(displayErr);
      setSynthesisState("failure");
      setProgressLog("");
      onAddNotification("Synthesis Failed", displayErr, "warning");
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !syncedAudioUrl) return;

    try {
      if (audioPlayState) {
        audioRef.current.pause();
        setAudioPlayState(false);
      } else {
        // Mobile Restrictions Bypass: Call load() right before play()
        audioRef.current.load();
        
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setAudioPlayState(true);
            })
            .catch((err) => {
              console.warn("[TtsStudio] Playback gesture restriction encountered:", err);
              setAudioPlayState(false);
              onAddNotification("Play Blocked", "Please interact with the screen first to play audio.", "info");
            });
        }
      }
    } catch (err) {
      console.error("[TtsStudio Playback Exception]:", err);
      setAudioPlayState(false);
    }
  };

  const handleDownloadMp3 = () => {
    if (!vocalBase64 && !syncedAudioUrl) return;

    triggerInterstitialAd(
      "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး MP3 အခမဲ့ဒေါင်းလုဒ်ဆွဲပါ",
      async () => {
        setIsDownloading(true);
        const fileName = `ZoeRecap_${Date.now()}.mp3`;
        try {
          let base64Data = vocalBase64;
          if (!base64Data && syncedAudioUrl) {
            if (syncedAudioUrl.startsWith("data:")) {
              const commaIndex = syncedAudioUrl.indexOf(",");
              base64Data = syncedAudioUrl.substring(commaIndex + 1);
            } else {
              base64Data = syncedAudioUrl;
            }
          }

          // Save natively to device Storage Downloads folder via Capacitor
          await Filesystem.writeFile({
            path: `Download/${fileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true,
          });

          setIsDownloading(false);
          await triggerAlert("🎉 MP3 အော်ဒီယိုဖိုင်ကို ဖုန်း၏ Download ဖိုဒါထဲသို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။", "အောင်မြင်ပါသည်");
          onAddNotification("Download Success", "MP3 saved to native Download folder.", "success");
        } catch (err) {
          console.warn("[File System Fallback] Native directories unavailable, writing via browser anchor:", err);
          try {
            const link = document.createElement("a");
            link.href = syncedAudioUrl || `data:audio/mp3;base64,${vocalBase64}`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setIsDownloading(false);
            await triggerAlert("🎉 MP3 အော်ဒီယိုဖိုင်ကို ဖုန်း၏ Download ဖိုဒါထဲသို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။", "အောင်မြင်ပါသည်");
            onAddNotification("Download Success", "MP3 downloaded via browser.", "success");
          } catch (browserErr) {
            console.error("MP3 final download loop error:", browserErr);
            setIsDownloading(false);
            await triggerAlert("ဒေါင်းလုဒ်ဆွဲရာတွင် အမှားအယွင်းရှိနေပါသည်။ ပြန်လည်ကြိုးစားပါ။", "အမှားအယွင်း");
          }
        }
      },
      onAddNotification
    );
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-3 pb-40 space-y-4 text-slate-200">
      {/* Title Header banner */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/10 rounded-2xl p-3.5 shadow-md">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
          <Volume2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
            Burmese Recap Studio <span className="text-[9px] bg-blue-500/20 text-blue-300 font-medium px-2 py-0.5 rounded-full uppercase">PWA</span>
          </h2>
          <p className="text-[10px] text-slate-400">Transform storytelling scripts into voice narrations</p>
        </div>
      </div>

      {/* Voice Controls */}
      <div className="bg-[#131926]/90 border border-[#1E293B] rounded-2xl p-3.5 space-y-3.5 shadow-sm">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" /> Configure Voice Attributes
        </span>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-medium">Select Actor (မြန်မာအသံ)</label>
            <div className="relative">
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-[#0D1321] border border-[#1E293B] text-xs text-slate-200 rounded-lg py-2 px-2.5 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
              >
                {VOICE_MATRIX.map((v) => (
                  <option key={v.code} value={v.code} className="bg-[#1A2333]">
                    {v.flag} {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-medium">Vocal Expression (အသံပုံစံ)</label>
            <div className="relative">
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full bg-[#0D1321] border border-[#1E293B] text-xs text-slate-200 rounded-lg py-2 px-2.5 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
              >
                <option value="general" className="bg-[#1A2333]">General (ရိုးရိုး)</option>
                <option value="chat" className="bg-[#1A2333]">Chat (စကားပြော)</option>
                <option value="newscast" className="bg-[#1A2333]">Newscast (သတင်းဖတ်သံ)</option>
                <option value="cheerful" className="bg-[#1A2333]">Cheerful (ပျော်ရွှင်သံ)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Script Area */}
      <div className="bg-[#131926]/90 border border-[#1E293B] rounded-2xl p-3.5 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Movie Narration Script (ဇာတ်လမ်းပြောစာသား)
          </span>
          <span className="text-[9px] text-slate-400 font-mono">
            Length: <b className="text-blue-400 font-semibold">{charCount}</b> chars
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ဒီနေရာမှာ ဇာတ်လမ်းပြောဇာတ်ညွှန်းကို ရိုက်ထည့်ပါ..."
          maxLength={10000}
          rows={5}
          className="w-full bg-[#0D1321]/80 border border-[#1E293B] text-xs text-slate-200 rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed placeholder-slate-500"
        />

        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Clause Splits: <b className="text-slate-300 font-mono">{chunkEstimate} parts</b></span>
          <span className="text-blue-400 font-medium">Auto-chunking enabled</span>
        </div>

        <button
          onClick={handleSynthesizeTts}
          disabled={synthesisState === "loading" || !text.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-blue-950/20"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${synthesisState === "loading" ? "animate-spin" : ""}`} />
          {synthesisState === "loading" ? "Synthesizing vocal waves..." : "Synthesize MP3 Voice"}
        </button>
      </div>

      {/* REBUILD THE UI WITH LOADING, SUCCESS, FAILURE STATES */}

      {/* LOADING STATE */}
      {synthesisState === "loading" && (
        <div className="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-4 text-center flex flex-col items-center justify-center space-y-2.5 animate-pulse shadow-sm">
          <Disc className="w-5 h-5 text-blue-400 animate-spin" />
          <p className="text-[10px] font-mono text-blue-300 tracking-wide">{progressLog}</p>
        </div>
      )}

      {/* FAILURE STATE */}
      {synthesisState === "failure" && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>Synthesis Pipeline Interrupted</span>
          </div>
          <p className="text-[10px] font-mono text-red-300 bg-red-950/40 p-2.5 rounded-lg border border-red-500/10 leading-relaxed">
            {errorMessage || "Failed to load audio source or unsupported format"}
          </p>
          <button
            onClick={handleSynthesizeTts}
            className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-500/20 rounded-lg text-[10px] font-semibold py-1.5 transition-colors"
          >
            Retry Generation (ပြန်လည်ပြုလုပ်ရန်)
          </button>
        </div>
      )}

      {/* SUCCESS STATE */}
      {synthesisState === "success" && syncedAudioUrl && (
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 space-y-3.5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              VOCAL STREAM MIXER READY
            </span>
            <span className="text-[8px] font-mono text-slate-500">MPEG Layer-3</span>
          </div>

          <audio 
            ref={audioRef} 
            src={syncedAudioUrl} 
            className="hidden" 
            onEnded={() => setAudioPlayState(false)} 
            onError={(e) => {
              const errorObj = e.currentTarget.error;
              console.error("[TtsStudio] Audio element failed to play:", errorObj?.code, errorObj?.message);
              
              if (errorObj && errorObj.code === 1) {
                // Abort error is normal on state change
                return;
              }
              
              setAudioPlayState(false);
              setSynthesisState("failure");
              setErrorMessage("Audio playback error: Failed to load audio source or unsupported format");
              onAddNotification(
                "Playback Error", 
                "Audio format is not supported or failed to load. Please try synthesizing again.", 
                "warning"
              );
            }}
          />

          <div className="flex items-center gap-3 bg-[#0D1321] rounded-xl p-3 border border-slate-800">
            <button
              onClick={togglePlayback}
              className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 flex items-center justify-center shrink-0 transition-all duration-200 active:scale-90"
            >
              {audioPlayState ? <Pause className="w-4 h-4 fill-current text-slate-950" /> : <Play className="w-4 h-4 fill-current text-slate-950 ml-0.5" />}
            </button>

            <div className="flex-1 flex flex-col justify-center overflow-hidden">
              <p className="text-[10px] text-slate-200 font-semibold truncate">ZoeRecap_Voice_Output.mp3</p>
              {/* Responsive live waveforms */}
              <div className="flex items-end gap-[1.5px] h-3 mt-1.5 select-none overflow-hidden">
                {Array.from({ length: 42 }).map((_, idx) => {
                  const height = audioPlayState 
                    ? Math.abs(Math.sin(idx * 0.2 + Date.now() * 0.05)) * 8 + 4
                    : 3;
                  return (
                    <div 
                      key={idx} 
                      className={`w-[1.5px] rounded-full transition-all duration-150 ${
                        audioPlayState ? 'bg-emerald-400' : 'bg-slate-700'
                      }`} 
                      style={{ height: `${height}px` }} 
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={handleDownloadMp3}
            disabled={isDownloading}
            className="w-full bg-[#1A2333] hover:bg-slate-800 disabled:bg-slate-800 disabled:opacity-70 border border-[#1E293B] text-slate-200 text-xs py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 font-semibold"
          >
            {isDownloading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-t-transparent border-slate-300 rounded-full animate-spin" />
                <span>Downloading... (ဒေါင်းလုဒ်ဆွဲနေသည်...)</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download MP3 Track</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
