import React, { useState, useRef, useEffect } from "react";
import { 
  Volume2, Play, Pause, Download, Settings, Disc, Sparkles, RefreshCw, Layers, CheckCircle 
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
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [syncedAudioUrl, setSyncedAudioUrl] = useState<string | null>(null);
  const [activeObjectUrl, setActiveObjectUrl] = useState<string | null>(null);
  const [audioPlayState, setAudioPlayState] = useState(false);

  useEffect(() => {
    return () => {
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [activeObjectUrl]);
  const [progressLog, setProgressLog] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const triggerAlert = async (message: string, title: string = "ဒေါင်းလုဒ်အခြေအနေ") => {
    if (typeof (window as any).customAlert === "function") {
      await (window as any).customAlert(message, title);
    } else {
      alert(message);
    }
  };

  const charCount = text.length;
  const chunkEstimate = Math.ceil(charCount / 180);

  const handleSynthesizeTts = async () => {
    if (!text.trim()) return;
    setIsSynthesizing(true);
    setAudioPlayState(false);
    setSyncedAudioUrl(null);
    setProgressLog("Splitting Script...");

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setProgressLog("Synthesizing Audio Streams in Parallel...");

      const normalizedStyle = selectedStyle.toLowerCase();
      let computedRate = "+0%";
      let computedPitch = "+0Hz";

      if (
        normalizedStyle.includes("cheerful") ||
        normalizedStyle.includes("တက်ကြွသံ") ||
        normalizedStyle.includes("ပျော်ရွှင်သံ")
      ) {
        computedRate = "+12%";
        computedPitch = "+6Hz";
      } else if (
        normalizedStyle.includes("newscast") ||
        normalizedStyle.includes("သတင်းဖတ်သံ")
      ) {
        computedRate = "+5%";
        computedPitch = "-2Hz";
      } else if (
        normalizedStyle.includes("chat") ||
        normalizedStyle.includes("စကားပြောသံ") ||
        normalizedStyle.includes("စကားပြော")
      ) {
        computedRate = "+8%";
        computedPitch = "+0Hz";
      } else {
        computedRate = "+0%";
        computedPitch = "+0Hz";
      }

      // Replicate sentence-splitting and chunking from server.ts directly on the client
      const sentences = text.split(/(?<=[။\.])/).map(s => s.trim()).filter(Boolean);
      const cleanedChunks: string[] = [];
      let currentChunk = "";
      let currentLinesCount = 0;

      for (let sentence of sentences) {
        if (sentence.length > 1800) {
          if (currentChunk) {
            cleanedChunks.push(currentChunk.trim());
            currentChunk = "";
            currentLinesCount = 0;
          }
          let temp = sentence;
          while (temp.length > 1800) {
            cleanedChunks.push(temp.slice(0, 1800));
            temp = temp.slice(1800);
          }
          sentence = temp;
          if (!sentence) continue;
        }

        if (currentChunk && (currentChunk.length + sentence.length + 1 > 1800 || currentLinesCount >= 10)) {
          cleanedChunks.push(currentChunk.trim());
          currentChunk = sentence;
          currentLinesCount = 1;
        } else {
          if (currentChunk) {
            const lastChar = currentChunk[currentChunk.length - 1];
            const needsSpace = !/[။\s]/.test(lastChar);
            currentChunk += (needsSpace ? " " : "") + sentence;
          } else {
            currentChunk = sentence;
          }
          currentLinesCount++;
        }
      }
      if (currentChunk.trim()) {
        cleanedChunks.push(currentChunk.trim());
      }

      if (cleanedChunks.length === 0) {
        throw new Error("The provided text contains no speakable characters.");
      }

      setProgressLog(`Synthesizing ${cleanedChunks.length} speech chunks directly from Edge-TTS...`);

      const fetchHeaders: Record<string, string> = {
        "Accept": "audio/mpeg, */*"
      };

      let chunkBuffers: ArrayBuffer[] = [];

      setProgressLog(`Parallel synthesis via Microsoft Edge-TTS (0% middleman overhead)...`);
      const chunkPromises = cleanedChunks.map(async (chunkText, index) => {
        const sanitizedText = chunkText.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
        const ttsUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(computedRate)}&pitch=${encodeURIComponent(computedPitch)}`;
        
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            let response: Response;
            
            if (attempt === 1) {
              // Direct fetch from Edge-TTS to satisfy physical device direct delivery
              response = await fetch(ttsUrl, { headers: fetchHeaders });
            } else {
              // Graceful fallback to our Express backend proxy for web preview to completely bypass CORS / "Failed to fetch" blockages
              const proxyUrl = getApiUrl("/api/tts");
              response = await safeFetch(proxyUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...fetchHeaders
                },
                body: JSON.stringify({
                  text: chunkText,
                  voice: selectedVoice,
                  rate: computedRate,
                  pitch: computedPitch,
                })
              });
            }

            if (!response.ok) {
              throw new Error(`HTTP status ${response.status}`);
            }

            let arrayBuffer: ArrayBuffer;
            if (attempt === 1) {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || contentType.includes("text/plain") || contentType.includes("application/json")) {
                throw new Error("Edge-TTS API returned text/HTML content instead of a valid audio stream.");
              }
              arrayBuffer = await response.arrayBuffer();
            } else {
              const blob = await response.blob();
              arrayBuffer = await blob.arrayBuffer();
            }

            if (arrayBuffer.byteLength === 0) {
              throw new Error("Received an empty audio buffer.");
            }
            
            // Check first 150 bytes of the generated chunk to verify it's not a text/HTML error response masquerading as audio
            const chunkSample = new Uint8Array(arrayBuffer.slice(0, 150));
            const chunkSampleText = new TextDecoder().decode(chunkSample).trim();
            if (
              chunkSampleText.startsWith("<!") || 
              chunkSampleText.startsWith("<html") || 
              chunkSampleText.startsWith("<HTML") || 
              chunkSampleText.startsWith("{") || 
              chunkSampleText.startsWith("[")
            ) {
              throw new Error("Received text/HTML error page content in chunk stream.");
            }

            return arrayBuffer;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[TTS Chunk ${index} Attempt ${attempt}] Failed: ${err.message || err}`);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 600 * attempt));
            }
          }
        }
        throw lastErr || new Error("Unknown synthesis error");
      });
      chunkBuffers = await Promise.all(chunkPromises);

      setProgressLog("Merging Final MP3 Voice...");
      await new Promise((resolve) => setTimeout(resolve, 600));

      const audioBlob = new Blob(chunkBuffers, { type: "audio/mpeg" });
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("Received an empty audio binary stream from synthesis server.");
      }

      // Check first 150 bytes of the generated blob to verify it's not a text/HTML error response masquerading as audio
      const sampleText = await audioBlob.slice(0, 150).text().catch(() => "");
      const trimmedSample = sampleText.trim();
      if (
        trimmedSample.startsWith("<!") || 
        trimmedSample.startsWith("<html") || 
        trimmedSample.startsWith("<HTML") || 
        trimmedSample.startsWith("{") || 
        trimmedSample.startsWith("[")
      ) {
        throw new Error("Synthesis failed: The server returned a text/HTML error instead of valid audio binary stream.");
      }

      // Revoke any existing object URL to free up browser memory
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        setActiveObjectUrl(null);
      }

      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // Convert audio binary stream (Blob) into a clean Base64 Data URI stream immediately in the client via FileReader to guarantee cross-platform support in native WebView
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64DataUrl = reader.result as string;
          setSyncedAudioUrl(base64DataUrl);
          setProgressLog("");
          setIsSynthesizing(false);
          onAddNotification(
            "Vocal Track Generated",
            "Synthesized long-form speech successfully using Microsoft Edge-TTS. Click Play!",
            "success"
          );

          // Register inside files list
          const fileName = `TTS_Voice_${Date.now().toString().slice(-4)}.mp3`;
          onAddDownloadedFile(fileName, "BINARY_MP3_STREAM", "audio", base64DataUrl);
        };
        reader.onerror = () => {
          throw new Error("Failed to compile audio stream into Base64 format.");
        };
        reader.readAsDataURL(audioBlob);
      } else {
        // Use highly optimized, native Object URL in the web preview to prevent Base64 string decoder limits and unsupported source errors
        const audioUrl = URL.createObjectURL(audioBlob);
        setActiveObjectUrl(audioUrl);
        setSyncedAudioUrl(audioUrl);
        setProgressLog("");
        setIsSynthesizing(false);
        onAddNotification(
          "Vocal Track Generated",
          "Synthesized long-form speech successfully using Microsoft Edge-TTS. Click Play!",
          "success"
        );

        const fileName = `TTS_Voice_${Date.now().toString().slice(-4)}.mp3`;
        onAddDownloadedFile(fileName, audioUrl, "audio", audioUrl);
      }
    } catch (err: any) {
      console.error(err);
      setProgressLog("");
      setIsSynthesizing(false);
      onAddNotification("Synthesis Failed", "Please verify internet connection or API settings.", "warning");
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (audioPlayState) {
      audioRef.current.pause();
      setAudioPlayState(false);
    } else {
      audioRef.current.play();
      setAudioPlayState(true);
    }
  };

  const handleDownloadMp3 = () => {
    if (!syncedAudioUrl) return;

    triggerInterstitialAd(
      "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး MP3 အခမဲ့ဒေါင်းလုဒ်ဆွဲပါ",
      async () => {
        setIsDownloading(true);
        const fileName = `ZoeRecap_${Date.now()}.mp3`;
        try {
          let base64Data = "";
          if (syncedAudioUrl.startsWith("data:")) {
            const commaIndex = syncedAudioUrl.indexOf(",");
            base64Data = syncedAudioUrl.substring(commaIndex + 1);
          } else {
            base64Data = syncedAudioUrl;
          }

          // Write natively to external storage Download folder
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
            link.href = syncedAudioUrl;
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

  useEffect(() => {
    // Sync current audio state on standard HTML5 timeline termination
    const handleEnded = () => setAudioPlayState(false);
    const audioNode = audioRef.current;
    if (audioNode) {
      audioNode.addEventListener("ended", handleEnded);
    }
    return () => {
      if (audioNode) {
        audioNode.removeEventListener("ended", handleEnded);
      }
    };
  }, [syncedAudioUrl]);

  // Stop background audio if navigating away or unmounting
  useEffect(() => {
    if (!isActive && audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setAudioPlayState(false);
      } catch (e) {
        console.warn("Error pausing tts audio on deactivation:", e);
      }
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.removeAttribute("src");
          audioRef.current.load();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans" id="tts-studio">
      <div className="p-2 border-b border-[#1E293B] bg-[#0D1321] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="p-0.5 rounded-md bg-blue-500/10 text-blue-400">
              <Volume2 className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-slate-100">Text to Voice Studio</h2>
              <p className="text-[8px] text-slate-450">Ultra Long-form Myanmar Voice Engrave</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-36 space-y-3 bg-[#070B13]">
        {/* Voice setup */}
        <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-blue-400" />
              Target Speaker Matrix
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="space-y-0.5">
              <label className="text-[9.5px] text-slate-400 font-medium font-sans">Voice Speaker (အသံရွေးချယ်ရန်)</label>
              <div className="relative">
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full bg-[#0D1321] border border-[#1E293B] text-xs text-slate-200 rounded-lg py-2 px-2.5 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
                >
                  {VOICE_MATRIX.map((v) => (
                    <option key={v.code} value={v.code} className="bg-[#1A2333]">
                      {v.flag} {v.name} ({v.language})
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-slate-400">
                  <Settings className="w-3 h-3" />
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              <label className="text-[9.5px] text-slate-400 font-medium font-sans">Voice Style (အသံအနေအထားပုံစံ)</label>
              <div className="relative">
                <select
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  className="w-full bg-[#0D1321] border border-[#1E293B] text-xs text-slate-200 rounded-lg py-2 px-2.5 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
                >
                  <option value="general" className="bg-[#1A2333]">General (ရိုးရိုး)</option>
                  <option value="chat" className="bg-[#1A2333]">Chat (စကားပြော)</option>
                  <option value="customerservice" className="bg-[#1A2333]">Customer Service (ဝန်ဆောင်မှုအသံ)</option>
                  <option value="newscast" className="bg-[#1A2333]">Newscast (သတင်းဖတ်သံ)</option>
                  <option value="cheerful" className="bg-[#1A2333]">Cheerful (ပျော်ရွှင်သံ)</option>
                  <option value="empathetic" className="bg-[#1A2333]">Empathetic (စာနာသံ)</option>
                </select>
                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-slate-400">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Text Area */}
        <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Voice Script (Supports 10,000+ chars)
            </span>
            <span className="text-[8px] text-slate-400 font-mono">
              Chars: <b className="text-blue-400">{charCount}</b>
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Introduce long script segments here..."
            maxLength={11000}
            rows={4}
            className="w-full bg-[#0D1321]/60 border border-[#1E293B] text-xs text-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed placeholder-slate-500"
          />

          <div className="flex items-center justify-between text-[8.5px] text-slate-400 px-0.5">
            <span>Buffer Parts: <b className="text-slate-300 font-mono">{chunkEstimate} Clause{chunkEstimate > 1 ? "s" : ""}</b></span>
            <span>No HTTP Timeouts</span>
          </div>

          <button
            onClick={handleSynthesizeTts}
            disabled={isSynthesizing || !text.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs py-2.5 rounded-lg transition-all duration-200 mt-1.5 flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-blue-950/20"
          >
            <RefreshCw className={`w-3 h-3 ${isSynthesizing ? "animate-spin" : ""}`} />
            {isSynthesizing ? "Synthesizing vocal wave..." : "Synthesize MP3 Voice"}
          </button>
        </div>

        {/* Loading progression logs */}
        {isSynthesizing && (
          <div className="bg-[#1D283C]/60 border border-blue-500/20 rounded-xl p-3 text-center flex flex-col items-center justify-center space-y-1.5">
            <Disc className="w-4 h-4 text-blue-400 animate-spin" />
            <p className="text-[9px] font-mono text-blue-300">{progressLog}</p>
          </div>
        )}

        {/* Combined Playback Engine Card */}
        {syncedAudioUrl && (
          <div className="bg-[#1A2333]/95 border border-emerald-500/20 rounded-xl p-3 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-emerald-400 flex items-center gap-0.5">
                <CheckCircle className="w-2.5 h-2.5" />
                INTEGRATED MIXER READY
              </span>
              <span className="text-[7.5px] font-mono text-slate-500">MPEG Layer-3</span>
            </div>

            <audio 
              ref={audioRef} 
              src={syncedAudioUrl} 
              className="hidden" 
              onEnded={() => setAudioPlayState(false)} 
              onError={() => {
                console.error("Audio playback error: Failed to load audio source or unsupported format");
                setAudioPlayState(false);
                onAddNotification(
                  "Playback Error", 
                  "Audio format is not supported or failed to load. Please try synthesizing again.", 
                  "warning"
                );
              }}
            />

            <div className="flex items-center gap-2.5 bg-[#0D1321] rounded-xl p-2.5 border border-slate-800">
              <button
                onClick={togglePlayback}
                className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 flex items-center justify-center shrink-0 transition-all duration-200"
              >
                {audioPlayState ? <Pause className="w-3.5 h-3.5 fill-current text-slate-950" /> : <Play className="w-3.5 h-3.5 fill-current text-slate-950 ml-0.5" />}
              </button>

              <div className="flex-1 flex flex-col justify-center">
                <p className="text-[9px] text-slate-200 font-semibold truncate">Burmese_Voice_Compiled.mp3</p>
                {/* Simulated waveforms visualizer */}
                <div className="flex items-end gap-[1.5px] h-2.5 mt-1 select-none">
                  {Array.from({ length: 32 }).map((_, idx) => {
                    const height = audioPlayState 
                      ? Math.sin(idx + Date.now() * 0.05) * 3 + 5 
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
              className="w-full bg-[#1A2333] hover:bg-slate-800 disabled:bg-slate-800 disabled:opacity-70 border border-[#1E293B] text-slate-200 text-xs py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5"
            >
              {isDownloading ? (
                <>
                  <div className="w-3 h-3 border-2 border-t-transparent border-slate-300 rounded-full animate-spin" />
                  <span>Downloading... (ဒေါင်းလုဒ်ဆွဲနေသည်...)</span>
                </>
              ) : (
                <>
                  <Download className="w-3 h-3" />
                  <span>Download MP3 Track</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
