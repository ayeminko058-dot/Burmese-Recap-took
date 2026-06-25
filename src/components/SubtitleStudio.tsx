import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, Plus, Trash2, Copy, Download, Play, Pause, RotateCcw, Upload, HelpCircle, Sparkles, Check, Info, Layout
} from "lucide-react";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { triggerInterstitialAd } from "../utils/admob";
import { SubtitleBlock } from "../types";
import { performProportionalAutoAlignment } from "../utils/burmeseProcessor";
import { getApiUrl } from "../utils/api";

// ==========================================
// 5. ENCAPSULATED BURMESE SUBTITLE ENGINE
// ==========================================
const BurmeseSubtitleEngine = {
  /**
   * Checks if a character is a Unicode Burmese Base Consonant or independent vowel
   */
  isBurmeseBase(char: string): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (code >= 0x1000 && code <= 0x1021) || 
           (code >= 0x1023 && code <= 0x102A) || 
           (code === 0x103F) || 
           (code >= 0x1040 && code <= 0x1049) || 
           (code >= 0x104C && code <= 0x104F);
  },

  /**
   * Checks if a character is a combining sign (vowels, medials, asat, tone marks, virama)
   */
  isBurmeseCombining(char: string): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (code >= 0x102B && code <= 0x103E) || 
           (code >= 0x1056 && code <= 0x1059) || 
           (code >= 0x105E && code <= 0x1060) || 
           (code >= 0x1062 && code <= 0x1064) || 
           (code >= 0x1067 && code <= 0x106D) || 
           (code >= 0x1071 && code <= 0x1074) || 
           (code >= 0x1082 && code <= 0x108D) || 
           (code === 0x109D);
  },

  /**
   * Segments Burmese text into logical syllable components using standard syllable boundary rules.
   */
  segmentText(text: string): { text: string; isWordOrSyllable: boolean }[] {
    const tokens: { text: string; isWordOrSyllable: boolean }[] = []; 
    let i = 0; 
    const len = text.length; 
    let currentSyllable = "";
    
    const flushCurrent = () => { 
      if (currentSyllable.length > 0) { 
        tokens.push({ text: currentSyllable, isWordOrSyllable: true }); 
        currentSyllable = ""; 
      } 
    };
    
    while (i < len) {
      const c = text[i];
      if (c === '\u1031' && i + 1 < len && this.isBurmeseBase(text[i + 1])) { 
        flushCurrent(); 
        currentSyllable += c + text[i + 1]; 
        i += 2; 
        continue; 
      }
      if (this.isBurmeseBase(c)) {
        let isKilledConsonant = false;
        if (currentSyllable.length > 0) {
          if (i + 1 < len && text[i + 1] === '\u103A') isKilledConsonant = true;
          else if (i + 2 < len && text[i + 2] === '\u103A' && this.isBurmeseCombining(text[i + 1])) isKilledConsonant = true;
          else if (i + 1 < len && text[i + 1] === '\u1039') isKilledConsonant = true;
        }
        if (isKilledConsonant) currentSyllable += c; 
        else { 
          flushCurrent(); 
          currentSyllable += c; 
        } 
        i++;
      } else if (this.isBurmeseCombining(c)) { 
        currentSyllable += c; 
        i++; 
      } else {
        flushCurrent();
        if (/\s/.test(c)) { 
          let sb = ""; 
          while (i < len && /\s/.test(text[i])) { 
            sb += text[i]; 
            i++; 
          } 
          tokens.push({ text: sb, isWordOrSyllable: false }); 
        }
        else if (/[a-zA-Z0-9]/.test(c)) { 
          let sb = ""; 
          while (i < len && !this.isBurmeseBase(text[i]) && !this.isBurmeseCombining(text[i]) && /[a-zA-Z0-9]/.test(text[i])) { 
            sb += text[i]; 
            i++; 
          } 
          tokens.push({ text: sb, isWordOrSyllable: true }); 
        }
        else { 
          tokens.push({ text: c, isWordOrSyllable: false }); 
          i++; 
        }
      }
    }
    flushCurrent(); 
    return tokens;
  },

  /**
   * Clean compound words helper
   */
  isSplitInsideCompound(fullText: string, splitIdx: number): boolean {
    const compounds = [
      "ရဲစခန်း", "တိတ်တဆိတ်", "လျှောက်ခြစ်", "မိန်းကလေး", "ငယ်လေး", "တစ်ယောက်",
      "စခန်းထဲက", "မုန့်တွေကို", "သာသာယာယာ", "ထိုင်စား", "တင်မကဘူး", "အမှုစစ်ဆေးချက်",
      "မှတ်တမ်းတွဲ", "ခွင့်ပြုချက်", "မရှိဘဲ", "သံသယရှိသူ", "သတ်မှတ်", "ခံထားရတဲ့",
      "အမျိုးသမီး", "ရုတ်တရက်ကြီး", "လူသတ်ခံရသူ", "ပြောင်းလဲ", "ပစ်လိုက်တယ်",
      "ဝင်သွား", "ခိုးဝင်", "ပြန်လည်", "လုပ်ဆောင်", "သတင်းအချက်အလက်", "ပြောကြား",
      "ရှင်းလင်း", "စစ်ဆေး", "မှတ်တမ်းတွဲ", "သတ်မှတ်ခံရ", "ပြောင်းလဲပစ်", "ထိုင်စားနေ",
      "လာခဲ့ပြီး", "စခန်းထဲ", "မုန့်တွေ", "စားနေရုံ"
    ];
    for (let i = 0; i < compounds.length; i++) {
      const word = compounds[i];
      let pos = 0;
      while (true) {
        const idx = fullText.indexOf(word, pos);
        if (idx === -1) break;
        const start = idx;
        const end = idx + word.length;
        if (splitIdx > start && splitIdx < end) {
          return true;
        }
        pos = idx + 1;
      }
    }
    return false;
  },

  /**
   * Refines spacing blocks with line-split limits ensuring zero orphaned characters
   */
  applyStackingRules(text: string): string {
    const trimmed = text.trim(); 
    const tokens = this.segmentText(trimmed); 
    const wordCount = tokens.filter(t => t.isWordOrSyllable).length;
    if (wordCount < 10) return trimmed;
    
    const fullText = tokens.map(t => t.text).join("");
    let bestTokenIdx = -1; 
    let minCost = Infinity; 
    const idealSyllables = wordCount / 2.0; 
    let currentSyllableCount = 0;
    let currentLength = 0;
    
    for (let i = 1; i < tokens.length; i++) {
      const prevToken = tokens[i - 1];
      if (prevToken.isWordOrSyllable) currentSyllableCount++;
      currentLength += prevToken.text.length;
      
      if (this.isBurmeseCombining(tokens[i].text[0])) continue;
      
      const splitsCompound = this.isSplitInsideCompound(fullText, currentLength);
      const syllableDiff = currentSyllableCount - idealSyllables; 
      let cost = syllableDiff * syllableDiff * 5.0;
      
      if (splitsCompound) {
        cost += 1000.0;
      }

      const prevTokenText = tokens[i - 1].text.trim();
      if (prevTokenText === "၊") cost -= 40.0; 
      if (prevTokenText === "ပြီး" || prevTokenText === "ပြီးတော့") cost -= 30.0; 
      if (tokens[i - 1].text === " ") cost -= 15.0;
      
      if (cost < minCost) { 
        minCost = cost; 
        bestTokenIdx = i; 
      }
    }
    
    if (bestTokenIdx === -1 || minCost > 800.0) {
      const fallbackTokenIdx = Math.floor(tokens.length / 2);
      let bestFallback = fallbackTokenIdx;
      let bestFallbackCost = Infinity;
      for (let d = -3; d <= 3; d++) {
        const idx = fallbackTokenIdx + d;
        if (idx > 0 && idx < tokens.length) {
          let len = 0;
          let syl = 0;
          for (let k = 0; k < idx; k++) {
            len += tokens[k].text.length;
            if (tokens[k].isWordOrSyllable) syl++;
          }
          if (this.isBurmeseCombining(tokens[idx].text[0])) continue;
          let cost = Math.abs(syl - idealSyllables);
          if (this.isSplitInsideCompound(fullText, len)) {
            cost += 100.0;
          }
          if (cost < bestFallbackCost) {
            bestFallbackCost = cost;
            bestFallback = idx;
          }
        }
      }
      bestTokenIdx = bestFallback;
    }
    
    const leftText = tokens.slice(0, bestTokenIdx).map(t => t.text).join("").trim(); 
    const rightText = tokens.slice(bestTokenIdx).map(t => t.text).join("").trim();
    
    return rightText.length === 0 ? leftText : (leftText + "\n" + rightText);
  },

  /**
   * Helper translates milliseconds into standard SRT timestamp format: HH:MM:SS,mmm
   */
  formatSrtTimestamp(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor(ms % 1000);

    const pad = (num: number, size: number) => {
      let s = num.toString();
      while (s.length < size) s = "0" + s;
      return s.slice(0, size);
    };

    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
  },

  /**
   * Resolves SRT string parses into milliseconds
   */
  parseSrtTimeToMs(timeStr: string): number {
    try {
      const parts = timeStr.trim().split(/[:,\.]/);
      if (parts.length >= 4) {
        const hrs = parseInt(parts[0], 10) || 0;
        const mins = parseInt(parts[1], 10) || 0;
        const secs = parseInt(parts[2], 10) || 0;
        const mils = parseInt(parts[3], 10) || 0;
        return (((hrs * 3600) + (mins * 60) + secs) * 1000) + mils;
      }
    } catch (e) {
      console.error("Error parsing SRT time:", e);
    }
    return 0;
  }
};

interface SubtitleStudioProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  onAddDownloadedFile: (name: string, data: string, type: "srt" | "audio" | "video") => void;
  isActive?: boolean;
}

const preloadedSubtitles = [
  {
    id: 1,
    startMs: 0,
    endMs: 4500,
    rawText: "မင်္ဂလာပါရှင့် မီဒီယာသတင်းကဏ္ဍကနေ ကြိုဆိုပါတယ်",
    displayText: "မင်္ဂလာပါရှင့်\nမီဒီယာသတင်းကဏ္ဍကနေ ကြိုဆိုပါတယ်"
  },
  {
    id: 2,
    startMs: 4500,
    endMs: 12000,
    rawText: "ယနေ့တင်ဆက်ပေးမဲ့ သတင်းအကြောင်းအရာကတော့",
    displayText: "ယနေ့တင်ဆက်ပေးမဲ့\nသတင်းအကြောင်းအရာကတော့"
  },
  {
    id: 3,
    startMs: 12000,
    endMs: 25000,
    rawText: "မြန်မာနိုင်ငံ၏ သတင်းနည်းပညာကဏ္ဍ အလွန်လျင်မြန်စွာတိုးတက်လာပုံပဲဖြစ်ပါတယ်",
    displayText: "မြန်မာနိုင်ငံ၏ သတင်းနည်းပညာကဏ္ဍ\nအလွန်လျင်မြန်စွာတိုးတက်လာပုံပဲဖြစ်ပါတယ်"
  },
  {
    id: 4,
    startMs: 25000,
    endMs: 42000,
    rawText: "အထူးသဖြင့် မိုဘိုင်းဖုန်းအသုံးပြုမှုနှုန်း မြင့်တက်လာခြင်းဖြစ်ပါတယ်",
    displayText: "အထူးသဖြင့် မိုဘိုင်းဖုန်းအသုံးပြုမှုနှုန်း\nမြင့်တက်လာခြင်းဖြစ်ပါတယ်"
  }
];

export default function SubtitleStudio({ onAddNotification, onAddDownloadedFile, isActive = true }: SubtitleStudioProps) {
  // States
  const [script, setScript] = useState(
    "ယခုတစ်ခေါက် တင်ဆက်ပေးမယ့် လူသတ်ကွင်း ဇာတ်လမ်းဟာ အင်္ဂလန်နိုင်ငံ အလယ်ပိုင်းဒေသမှာ အမှန်တကယ် ဖြစ်ပွားခဲ့တဲ့ ဖြစ်ရပ်ဆန်း တစ်ခုပဲ ဖြစ်ပါတယ်။ မြန်မာနိုင်ငံ၏ သတင်းနည်းပညာကဏ္ဍ အလွန်လျင်မြန်စွာတိုးတက်လာပုံပဲဖြစ်ပါတယ်။"
  );
  const [blocks, setBlocks] = useState<any[]>(preloadedSubtitles);
  const [isDownloadingSrt, setIsDownloadingSrt] = useState(false);

  const triggerAlert = async (message: string, title: string = "ဒေါင်းလုဒ်အခြေအနေ") => {
    if (typeof (window as any).customAlert === "function") {
      await (window as any).customAlert(message, title);
    } else {
      alert(message);
    }
  };
  
  // Customizer styling states
  const [accentClass, setAccentClass] = useState("text-yellow-400");
  const [bgClass, setBgClass] = useState("bg-black/85 border border-yellow-500/10");
  const [fontSizeClass, setFontSizeClass] = useState("text-sm");

  // Media loading states
  const [mediaFileName, setMediaFileName] = useState("captured_news_media.mp4");
  const [mediaFileSize, setMediaFileSize] = useState("14.22 MB");
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0); // dynamic media playback duration
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  // Global settings API key sync state
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");

  // Simulation play state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgressMs, setSimulationProgressMs] = useState(0);
  const [justCopied, setJustCopied] = useState(false);

  // Alignment engine states
  const [alignmentMode, setAlignmentMode] = useState<"manual" | "ai_sync">("manual");
  const [isAligning, setIsAligning] = useState(false);
  const [aligningStatus, setAligningStatus] = useState("");
  const [aligningProgress, setAligningProgress] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const simulationIntervalRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaObjectUrlRef = useRef<string | null>(null);

  // Sync the mutable ref with state to allow access inside empty-dependency unmount hooks
  useEffect(() => {
    mediaObjectUrlRef.current = mediaObjectUrl;
  }, [mediaObjectUrl]);

  // Stats
  const totalBlocks = blocks.length;
  const totalChars = blocks.reduce((sum, b) => sum + b.rawText.length, 0);
  const currentTotalDuration = mediaDuration > 0 ? mediaDuration * 1000 : 60000;
  const avgDurationPerBlock = totalBlocks > 0 ? Math.round(currentTotalDuration / totalBlocks) : 0;

  // Listen to storage events to keep API key reactively synchronized across workspaces
  useEffect(() => {
    const handleStorageChange = () => {
      setGeminiApiKey(localStorage.getItem("gemini_api_key") || "");
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Aggressive memory and playback cleanup when deactivated or unmounted
  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch (err) {
          console.warn("Cleanup error for video player:", err);
        }
      }
      if (mediaObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(mediaObjectUrlRef.current);
        } catch (revokeErr) {
          console.warn("Error revoking media object URL on unmount:", revokeErr);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopSimulation();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch (err) {
          console.warn("Deactivation error for video player:", err);
        }
      }
      if (mediaObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(mediaObjectUrlRef.current);
        } catch (revokeErr) {
          console.warn("Error revoking media object URL on deactivation:", revokeErr);
        }
      }
    }
  }, [isActive]);

  // 1. FILE PICKING HANDLER
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const name = file.name;
    const mbSize = (file.size / (1024 * 1024)).toFixed(2);
    setMediaFileName(name);
    setMediaFileSize(`${mbSize} MB`);

    if (mediaObjectUrl) {
      URL.revokeObjectURL(mediaObjectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setMediaObjectUrl(objectUrl);
    
    // Stop simulation when media loads
    stopSimulation();
    
    onAddNotification("Media Stream Loaded", `Incorporated: ${name} (${mbSize} MB)`, "success");
  };

  const handleClearMedia = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (mediaObjectUrl) {
      URL.revokeObjectURL(mediaObjectUrl);
    }
    setMediaFile(null);
    setMediaFileName("captured_news_media.mp4");
    setMediaFileSize("0 MB");
    setMediaObjectUrl(null);
    setMediaDuration(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    stopSimulation();
    onAddNotification("Media Stream Cleared", "The target media reference was securely wiped.", "info");
  };

  // Get runtime duration
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setMediaDuration(videoRef.current.duration);
    }
  };

  // React to native media time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const currentMs = Math.round(videoRef.current.currentTime * 1000);
      setSimulationProgressMs(currentMs);
    }
  };

  // 2. PURE JAVASCRIPT PUNCTUATION-BASED SPLITTING (NO GEMINI AI)
  const parseScriptPunctuation = (rawText: string) => {
    if (!rawText.trim()) return [];
    
    const segments: string[] = [];
    let currentSegment = "";
    let i = 0;
    
    while (i < rawText.length) {
      const char = rawText[i];
      if (char === ".") {
        // [ . ] English Full Stop is completely stripped out, deleted and omitted from the final subtitle text string.
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = "";
        i++;
      } else if (char === "။") {
        // Look ahead for double Burmese full stop
        if (i + 1 < rawText.length && rawText[i + 1] === "။") {
          currentSegment += "။။";
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
          }
          currentSegment = "";
          i += 2;
        } else {
          currentSegment += "။";
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
          }
          currentSegment = "";
          i++;
        }
      } else {
        currentSegment += char;
        i++;
      }
    }
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }
    return segments;
  };

  // 3. MATHEMATICAL CHUNKING & GAPLESS TIMELINE ALIGNMENT
  const handleAutoAlignment = () => {
    const rawText = script.trim();
    if (!rawText) {
      onAddNotification("Empty Input", "Please provide a valid script text first.", "warning");
      return;
    }

    // Exact media duration or fallback inside simulator 60,000ms
    const activeMediaDurationMs = videoRef.current && videoRef.current.duration 
      ? Math.round(videoRef.current.duration * 1000) 
      : 60000;

    const segments = parseScriptPunctuation(rawText);
    if (segments.length === 0) {
      onAddNotification("Parse Incomplete", "No sentences separated by [ . ] or [ ။ ] found.", "warning");
      return;
    }

    if (alignmentMode === "manual") {
      // IF 'Manual' IS ACTIVE: Use the legacy purely mathematical character-proportional timing slicing engine
      const durationSec = activeMediaDurationMs / 1000;
      const results = performProportionalAutoAlignment(rawText, durationSec);
      
      const alignedBlocks = results.map((r, idx) => ({
        id: idx + 1,
        startMs: r.startMs,
        endMs: r.endMs,
        rawText: segments[idx] || r.text.replace(/\n/g, " "),
        displayText: r.text
      }));

      setBlocks(alignedBlocks);
      setSimulationProgressMs(0);
      stopSimulation();
      
      onAddNotification(
        "Proportional Alignment Completed", 
        `Compiled ${alignedBlocks.length} subtitle slices gaplessly across ${Math.round(activeMediaDurationMs / 1000)} seconds.`, 
        "success"
      );
    } else {
      // IF 'AI Sync' IS ACTIVE: Run the advanced voice forced-alignment module.
      setIsAligning(true);
      setAligningProgress(15);
      setAligningStatus("Preparing multi-modal speech buffers...");

      const alignSubtitles = async () => {
        try {
          const savedKey = localStorage.getItem("gemini_api_key") || "";
          if (!savedKey) {
            throw new Error("Gemini API Key is required for AI Sync. Please enter a valid key below first.");
          }
          if (!mediaFile) {
            throw new Error("No target media uploaded. Please click on 'Target Media Stream' to select a video/audio file first.");
          }
          
          setAligningProgress(35);
          setAligningStatus("Uploading media stream and sentence segments to Gemini...");

          const formData = new FormData();
          formData.append("file", mediaFile);
          formData.append("text", rawText);
          formData.append("segments", JSON.stringify(segments));
          formData.append("activeMediaDurationMs", activeMediaDurationMs.toString());
          formData.append("alignmentMode", "ai_sync");

          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          abortControllerRef.current = new AbortController();

          setAligningProgress(60);
          setAligningStatus("Calibrating vocal phonetic waveforms via Gemini Speech Model...");

          let isWatchdogTriggered = false;
          const watchdogTimeout = setTimeout(() => {
            if (abortControllerRef.current) {
              isWatchdogTriggered = true;
              console.warn("[Watchdog] Alignment has been hanging at 60% for more than 45 seconds. Aborting request.");
              abortControllerRef.current.abort();
            }
          }, 45000);

          let response;
          try {
            response = await fetch(getApiUrl("/api/subtitle/align"), {
              method: "POST",
              headers: {
                "X-Gemini-API-Key": savedKey
              },
              body: formData,
              signal: abortControllerRef.current.signal
            });
          } catch (fetchErr: any) {
            if (isWatchdogTriggered) {
              throw new Error("Vocal phonetic waveform calibration timed out (45s). Please try again or use manual mode.");
            }
            throw fetchErr;
          } finally {
            clearTimeout(watchdogTimeout);
          }

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || `Server responded with status ${response.status}`);
          }

          setAligningProgress(85);
          setAligningStatus("Validating chronological sequences and rendering final subtitles...");

          const data = await response.json();
          if (!data.blocks || !Array.isArray(data.blocks)) {
            throw new Error("Invalid response format from subtitle alignment server.");
          }

          const alignedBlocks = data.blocks.map((block: any) => ({
            id: block.id,
            startMs: block.startMs,
            endMs: block.endMs,
            rawText: block.text,
            displayText: BurmeseSubtitleEngine.applyStackingRules(block.text)
          }));

          setBlocks(alignedBlocks);
          setSimulationProgressMs(0);
          stopSimulation();
          setIsAligning(false);

          onAddNotification(
            "AI Forced Alignment Successful", 
            `Snapped ${alignedBlocks.length} subtitle syllable boundaries dynamically via the backend Hybrid Calibration loop.`, 
            "success"
          );
        } catch (error: any) {
          if (error.name === "AbortError") {
            console.log("[AI Sync] Alignment operation aborted by user.");
            onAddNotification("Alignment Cancelled", "The calibration process was stopped.", "info");
          } else {
            console.error("[AI Alignment Error]:", error);
            onAddNotification(
              "AI Sync Failed", 
              error.message || "Failed to align subtitles. Confirm key credentials and media stream.", 
              "warning"
            );
          }
        } finally {
          setIsAligning(false);
        }
      };

      alignSubtitles();
    }
  };

  // Reset workspace
  const handleResetWorkspace = async () => {
    const confirmed = typeof (window as any).customConfirm === "function"
      ? await (window as any).customConfirm("Restore factory default subtitle track blocks? This will refresh translations.", "Reset Subtitles")
      : window.confirm("Restore factory default subtitle track blocks? This will refresh translations.");
    
    if (confirmed) {
      setBlocks(preloadedSubtitles);
      setSimulationProgressMs(0);
      stopSimulation();
      onAddNotification("Workspace Reset", "Returned to demo subtitle blocks.", "info");
    }
  };

  // 4. PLAYBACK SIMULATION TOGGLE
  const toggleSimulation = () => {
    if (isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  };

  const startSimulation = () => {
    // If we have an actual loaded video, play the native HTML tag instead!
    if (mediaObjectUrl && videoRef.current) {
      videoRef.current.play();
      setIsSimulating(true);
      return;
    }

    setIsSimulating(true);
    const maxLimitMs = blocks.length > 0 ? blocks[blocks.length - 1].endMs : 60000;

    simulationIntervalRef.current = setInterval(() => {
      setSimulationProgressMs((prev) => {
        const next = prev + 100;
        if (next >= maxLimitMs) {
          return 0; // infinite loops nicely
        }
        return next;
      });
    }, 100);
  };

  const stopSimulation = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    
    setIsSimulating(false);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
  };

  const jumpToTimeMs = (ms: number) => {
    setSimulationProgressMs(ms);
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
    }
  };

  // Manage editable block fields
  const handleBlockTextUpdate = (id: number, text: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { 
      ...b, 
      rawText: text, 
      displayText: BurmeseSubtitleEngine.applyStackingRules(text) 
    } : b));
  };

  const handleBlockTimeUpdate = (id: number, type: "start" | "end", strVal: string) => {
    const calculatedMs = BurmeseSubtitleEngine.parseSrtTimeToMs(strVal);
    setBlocks(prev => prev.map(b => b.id === id ? {
      ...b,
      [type === "start" ? "startMs" : "endMs"]: calculatedMs
    } : b));
  };

  const handleDeleteBlockRow = (id: number) => {
    setBlocks(prev => prev.filter(b => b.id !== id).map((b, i) => ({ ...b, id: i + 1 })));
    onAddNotification("Block Expelled", "Eradicated block row.", "warning");
  };

  const appendBlankSubtitleBlock = () => {
    const finalEndMs = blocks.length > 0 ? blocks[blocks.length - 1].endMs : 0;
    const newBlock = {
      id: blocks.length + 1,
      startMs: finalEndMs + 100,
      endMs: finalEndMs + 3100,
      rawText: "စာတန်းအသစ် ပြင်ဆင်ရန်...",
      displayText: "စာတန်းအသစ် ပြင်ဆင်ရန်..."
    };

    setBlocks(prev => [...prev, newBlock]);
    onAddNotification("Block Appended", "Added new writable timeline sequence.", "info");
  };

  // SRT Compiler Exporters
  const generateSrtPayload = () => {
    return blocks.map((block, index) => {
      const start = BurmeseSubtitleEngine.formatSrtTimestamp(block.startMs);
      const end = BurmeseSubtitleEngine.formatSrtTimestamp(block.endMs);
      return `${index + 1}\n${start} --> ${end}\n${block.displayText}\n`;
    }).join("\n");
  };

  const handleDownloadSrtText = () => {
    if (blocks.length === 0) return;

    triggerInterstitialAd(
      "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး စာတန်းထိုး SRT ကို ရယူပါ",
      async () => {
        setIsDownloadingSrt(true);
        const srtStr = generateSrtPayload();
        // Maintain consistent naming format
        const cleanFileName = `Burmese_${mediaFileName.split(".")[0] || "Track"}_${Date.now()}.srt`;

        try {
          // Convert string to base64 encoding safely supporting Burmese Unicode characters
          const utf8Bytes = new TextEncoder().encode(srtStr);
          let binary = "";
          const len = utf8Bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(utf8Bytes[i]);
          }
          const base64Data = btoa(binary);

          // Write natively to Download directory folder using Capacitor Filesystem
          await Filesystem.writeFile({
            path: `Download/${cleanFileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true,
          });

          setIsDownloadingSrt(false);
          await triggerAlert("🎉 SRT စာတန်းထိုးဖိုင်ကို ဖုန်း၏ Download ဖိုဒါထဲသို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။", "အောင်မြင်ပါသည်");
          
          if (onAddDownloadedFile) {
            onAddDownloadedFile(cleanFileName, srtStr, "srt");
          }
          onAddNotification("SRT Saved Successfully", `${cleanFileName} written to Download folder.`, "success");
        } catch (err) {
          console.warn("[File System Fallback] Native directories unavailable, writing via browser anchor:", err);
          try {
            const blob = new Blob([srtStr], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = cleanFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setIsDownloadingSrt(false);
            await triggerAlert("🎉 SRT စာတန်းထိုးဖိုင်ကို ဖုန်း၏ Download ဖိုဒါထဲသို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။", "အောင်မြင်ပါသည်");
            
            if (onAddDownloadedFile) {
              onAddDownloadedFile(cleanFileName, srtStr, "srt");
            }
            onAddNotification("SRT Saved Successfully", `${cleanFileName} exported.`, "success");
          } catch (browserErr) {
            console.error("SRT final download loop error:", browserErr);
            setIsDownloadingSrt(false);
            await triggerAlert("ဒေါင်းလုဒ်ဆွဲရာတွင် အမှားအယွင်းရှိနေပါသည်။ ပြန်လည်ကြိုးစားပါ။", "अမှားအယွင်း");
          }
        }
      },
      onAddNotification
    );
  };

  const handleCopySrtText = () => {
    if (blocks.length === 0) return;

    triggerInterstitialAd(
      "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး စာတန်းထိုး SRT ကို ရယူပါ",
      () => {
        const srtStr = generateSrtPayload();
        navigator.clipboard.writeText(srtStr).then(() => {
          setJustCopied(true);
          onAddNotification("Copied to Clipboard", "SubRip plain-text segment buffered.", "success");
          setTimeout(() => setJustCopied(false), 2000);
        });
      },
      onAddNotification
    );
  };

  // Clock format tool
  const formatMinsPercentSecs = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const mils = Math.floor(ms % 1000);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(mils).padStart(3, "0")}`;
  };

  // Identify active rendering caption
  const activeBlock = blocks.find(b => simulationProgressMs >= b.startMs && simulationProgressMs <= b.endMs);

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans" id="subtitle-studio-refactored">
      {/* Mini Title bar strip-down branding compliant - Compressed by 33% */}
      <div className="p-2 border-b border-[#1E293B] bg-[#0D1321] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="p-0.5 rounded-md bg-cyan-500/10 text-cyan-400">
            <Layout className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-100">Subtitle Aligner Studio</h2>
            <p className="text-[8px] text-slate-450">Precision Punctuation Aligner & Stack Formatter</p>
          </div>
        </div>
        <button
          onClick={handleResetWorkspace}
          className="text-[8px] bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350 py-0.5 px-2.5 rounded-lg font-medium transition"
        >
          Reset Demo Blocks
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 pb-36 space-y-2.5 bg-[#070B13]">
        {/* Main Grid View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 pb-4">
          
          {/* Left Columns (5 Cols) */}
          <div className="lg:col-span-12 xl:col-span-5 space-y-2.5">
            
            {/* 1. Target Media Stream - Compressed */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-2.5 space-y-1.5 relative overflow-hidden">
              <h3 className="text-[9.5px] font-bold text-slate-205 flex items-center gap-1.5 uppercase tracking-wider">
                <span className="text-cyan-500 font-bold">◆</span>
                1. Target Media Stream
              </h3>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#1E293B] hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded-xl p-2.5 text-center cursor-pointer transition duration-200"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="video/*,audio/*" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold text-slate-300 truncate max-w-[150px] sm:max-w-[200px]">
                        {mediaFileName}
                      </p>
                      <p className="text-[9px] text-slate-450">
                        Size: {mediaFileSize} — Click to load file
                      </p>
                    </div>
                  </div>
                  {(mediaFile || mediaObjectUrl) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearMedia();
                      }}
                      className="py-1 px-2.5 bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-extrabold text-[9px] rounded-lg transition-all shadow-sm shrink-0 flex items-center gap-1 active:scale-95"
                    >
                      Cancel Upload
                    </button>
                  )}
                </div>
              </div>

              {/* Native html component element */}
              {mediaObjectUrl && (
                <div className="mt-1.5 rounded-xl overflow-hidden bg-black border border-slate-800/60 p-1">
                  <video 
                    ref={videoRef}
                    src={mediaObjectUrl} 
                    controls 
                    className="w-full h-auto aspect-video max-h-[140px] rounded" 
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                  />
                </div>
              )}
            </div>

            {/* Subtitle Track Analytics Panel - Clean Display Segment (Compressed) */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-2.5 space-y-1.5">
              <h3 className="text-[9.5px] font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <span className="text-emerald-500 font-bold">◆</span>
                Subtitle Track Analytics Panel
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-[#0D1321] border border-slate-800 p-1.5 rounded-lg text-center">
                  <span className="text-[8px] text-slate-500 uppercase block font-semibold">Total Blocks</span>
                  <span className="text-xs font-bold text-slate-200 mt-0.5 block">{totalBlocks}</span>
                </div>
                <div className="bg-[#0D1321] border border-slate-800 p-1.5 rounded-lg text-center">
                  <span className="text-[8px] text-slate-500 uppercase block font-semibold">Chars Count</span>
                  <span className="text-xs font-bold text-slate-100 mt-0.5 block">{totalChars}</span>
                </div>
                <div className="bg-[#0D1321] border border-slate-800 p-1.5 rounded-lg text-center">
                  <span className="text-[8px] text-slate-500 uppercase block font-semibold">Avg Millis</span>
                  <span className="text-xs font-bold text-cyan-400 mt-0.5 block font-mono">{avgDurationPerBlock} ms</span>
                </div>
              </div>
            </div>

            {/* 3. Primary Translation Script Area - Compressed */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-2.5 space-y-1.5 flex flex-col justify-between">
              <div>
                <h3 className="text-[9.5px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                  <span className="text-cyan-500">■</span>
                  3. Primary Translation Script
                </h3>
                <p className="text-[8.5px] text-slate-450 leading-normal mb-1.5">
                  Segments blocks instantly by punctuation: Burmese [ ။ ] remains intact; English [ . ] is stripped.
                </p>
                <textarea
                  id="raw-script-input"
                  rows={3}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Type or paste Burmese transcript sentences separated by [ . ] or [ ။ ] ...."
                  className="w-full bg-[#0D1321] border border-[#1E293B] text-xs text-slate-250 rounded-lg p-2 focus:outline-none focus:border-cyan-500 transition-colors leading-relaxed placeholder-slate-500 font-sans resize-none"
                />
              </div>

              {/* Sleek Micro-sized Toggle Selector Pill-switch */}
              <div className="flex items-center justify-between bg-[#0D1321] border border-[#1E293B] p-1 rounded-lg">
                <span className="text-[8.5px] font-bold text-slate-400 pl-1">Alignment Mode:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setAlignmentMode("manual")}
                    className={`text-[8px] font-extrabold px-2 py-0.5 rounded transition-all ${
                      alignmentMode === "manual"
                        ? "bg-cyan-600 text-white shadow-sm font-bold"
                        : "text-slate-500 hover:text-slate-300 font-normal"
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlignmentMode("ai_sync")}
                    className={`text-[8px] font-extrabold px-2 py-0.5 rounded transition-all flex items-center gap-0.5 ${
                      alignmentMode === "ai_sync"
                        ? "bg-purple-600 text-white shadow-sm font-bold"
                        : "text-slate-500 hover:text-slate-300 font-normal"
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5 text-purple-300" />
                    AI Sync
                  </button>
                </div>
              </div>

              {/* Inline Gemini API Key configuration input field */}
              {alignmentMode === "ai_sync" && !geminiApiKey && (
                <div className="bg-purple-950/40 border border-purple-500/20 p-2 rounded-lg space-y-1 relative overflow-hidden animate-fade-in mt-1">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-xl pointer-events-none" />
                  <p className="text-[9px] font-bold text-purple-300 flex items-center gap-1 uppercase tracking-wide select-none">
                    <Sparkles className="w-2.5 h-2.5" />
                    Enter Gemini API Key to unlock AI Sync:
                  </p>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val) {
                        localStorage.setItem("gemini_api_key", val);
                        setGeminiApiKey(val);
                        window.dispatchEvent(new Event("storage"));
                        onAddNotification("API Key Loaded", "Gemini key registered and synchronized globally.", "success");
                      }
                    }}
                    className="w-full bg-[#0D1321] border border-purple-500/30 text-[10px] text-purple-100 rounded px-2 py-1 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={handleAutoAlignment}
                  className="py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[9px] rounded-lg shadow-md transition-all flex items-center justify-center gap-1 active:scale-[0.98]"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Align Timeline</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScript("")}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[9px] rounded-lg transition-all"
                >
                  Clear Script
                </button>
              </div>
            </div>

          </div>

          {/* Right Columns (7 Cols) */}
          <div className="lg:col-span-12 xl:col-span-7 space-y-3">

            {/* InShot UI Live Canvas Viewport Box */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-3 space-y-2.5 flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-250 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-yellow-400">●</span>
                  InShot UI Live Canvas
                </h3>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={toggleSimulation}
                    className="py-0.5 px-2 bg-blue-600/10 hover:bg-blue-600/25 border border-blue-500/20 text-blue-400 hover:text-blue-300 font-bold text-[9px] rounded-md transition-all flex items-center gap-1 active:scale-[0.97]"
                  >
                    {isSimulating ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                    <span>{isSimulating ? "Pause" : "Play"}</span>
                  </button>
                  <span className="text-[9px] font-mono text-slate-400 bg-black/40 border border-[#1E293B] rounded px-1.5 py-0.5">
                    {formatMinsPercentSecs(simulationProgressMs)} / {formatMinsPercentSecs(currentTotalDuration)}
                  </span>
                </div>
              </div>

              {/* Viewport Render Layer Frame */}
              <div className="bg-black aspect-video rounded-xl relative border border-slate-800/80 overflow-hidden flex items-center justify-center shadow-2xl">
                {/* Simulated Backdrop wallpaper picture */}
                <div 
                  className="absolute inset-0 bg-cover bg-center opacity-45 blur-[1px]" 
                  style={{ backgroundImage: "url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop')" }}
                />
                
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/45 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-slate-800">
                  <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[7px] font-extrabold uppercase text-slate-400 tracking-wider">1080p Cinematic Feed</span>
                </div>

                <div className="absolute top-2 right-2 text-[7px] font-bold tracking-widest text-slate-500/50 uppercase">
                  Burmese Sub Aligner
                </div>

                {/* Subtitle Render Engine Display Target */}
                <div className="absolute bottom-4 left-3 right-3 flex items-center justify-center pointer-events-none select-none">
                  {activeBlock ? (
                    <div 
                      id="canvas-caption-output"
                      className={`text-center font-bold px-3 py-1.5 rounded border leading-relaxed shadow-xl whitespace-pre-wrap filter drop-shadow transition-all duration-150 ${accentClass} ${fontSizeClass} ${bgClass}`}
                    >
                      {activeBlock.displayText}
                    </div>
                  ) : (
                    <div className="text-[8px] font-mono text-slate-600 italic">No subtitle active</div>
                  )}
                </div>
              </div>

              {/* Stylizer dropdown matrices */}
              <div className="grid grid-cols-3 gap-2 pt-1.5">
                <div>
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                    Line Accent
                  </label>
                  <select 
                    value={accentClass}
                    onChange={(e) => setAccentClass(e.target.value)}
                    className="w-full bg-[#0D1321] border border-[#1E293B] focus:border-blue-500 rounded-lg p-1 text-[10px] text-slate-300 font-semibold outline-none"
                  >
                    <option value="text-yellow-400">★ Classic Yellow</option>
                    <option value="text-white">☆ Crystal White</option>
                    <option value="text-emerald-400">⚡ Neon Emerald</option>
                    <option value="text-blue-400">🌊 Dynamic Blue</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                    Backdrop Style
                  </label>
                  <select 
                    value={bgClass}
                    onChange={(e) => setBgClass(e.target.value)}
                    className="w-full bg-[#0D1321] border border-[#1E293B] focus:border-blue-500 rounded-lg p-1 text-[10px] text-slate-300 font-semibold outline-none"
                  >
                    <option value="bg-black/85 border border-yellow-500/10">Jet Glassmorphic</option>
                    <option value="bg-black border border-slate-900">Double Black</option>
                    <option value="bg-slate-900/90 border border-slate-800">Slate Minimalist</option>
                    <option value="bg-transparent border-0 shadow-none">No Frame Backdrop</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                    Font Size Scale
                  </label>
                  <select 
                    value={fontSizeClass}
                    onChange={(e) => setFontSizeClass(e.target.value)}
                    className="w-full bg-[#0D1321] border border-[#1E293B] focus:border-blue-500 rounded-lg p-1 text-[10px] text-slate-300 font-semibold outline-none"
                  >
                    <option value="text-xs">Compact Mobile</option>
                    <option value="text-sm font-semibold">Standard Medium</option>
                    <option value="text-base font-extrabold">Bold Large (InShot)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Universal Exporters and Action Deck */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-2.5 shadow-md">
              <div className="text-center md:text-left">
                <h4 className="text-[11px] font-semibold text-slate-200">Active Exporter Core</h4>
                <p className="text-[9px] text-slate-400 font-medium">Export pure, punctuation-compliant SubRip srt captions directly.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadSrtText}
                  disabled={blocks.length === 0 || isDownloadingSrt}
                  className="py-1.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-[10.5px] rounded-lg shadow-md transition-all flex items-center gap-1"
                >
                  {isDownloadingSrt ? (
                    <>
                      <div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      <span>Download SRT</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCopySrtText}
                  disabled={blocks.length === 0}
                  className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-semibold text-[10.5px] rounded-lg transition"
                >
                  {justCopied ? "Copied!" : "Copy SRT"}
                </button>
              </div>
            </div>

            {/* 4. Interactive Timeframes Workspace - Block Stack */}
            <div className="bg-[#1A2333]/90 border border-[#1E293B] rounded-xl p-3 flex flex-col space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#1E293B]">
                <h3 className="text-[10px] font-bold text-slate-250 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-indigo-400">◆</span>
                  4. Timeframes Workspace - Block Stack
                </h3>
                <button 
                  onClick={appendBlankSubtitleBlock}
                  className="p-0.5 px-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold text-[8px] rounded transition"
                >
                  + Add Block
                </button>
              </div>

              {/* Captions stack timeline mapping */}
              <div id="subtitle-master-timeline-list" className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
                {blocks.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 italic text-[10px]">
                    No active timed subtitle blocks parsed. Paste your storyboard narrative above and press auto-align.
                  </div>
                ) : (
                  blocks.map((block, idx) => {
                    const isActive = activeBlock?.id === block.id;
                    return (
                      <div 
                        key={block.id}
                        id={`dom-block-card-${block.id}`}
                        className={`bg-[#0D1321] border rounded-xl p-2.5 flex flex-col space-y-2 transition relative group ${
                          isActive ? "border-blue-500 shadow-lg bg-blue-950/20" : "border-[#1E293B] hover:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] font-extrabold text-blue-400 uppercase tracking-wider">
                            Subtitle Block #{block.id}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => jumpToTimeMs(block.startMs)}
                              className="text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-500/40 px-2 py-0.5 rounded transition"
                            >
                              Seek Here
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBlockRow(block.id)}
                              className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition"
                              title="Delete block row"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Timing interval edits */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[7.5px] font-bold text-slate-500 uppercase block mb-0.5">
                              Start Interval
                            </label>
                            <input 
                              type="text"
                              defaultValue={BurmeseSubtitleEngine.formatSrtTimestamp(block.startMs)}
                              onBlur={(e) => handleBlockTimeUpdate(block.id, "start", e.target.value)}
                              className="w-full bg-[#1A2333]/70 border border-[#1E293B] focus:border-blue-500 rounded py-0.5 px-1.5 text-[11px] font-mono font-semibold text-slate-300 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[7.5px] font-bold text-slate-500 uppercase block mb-0.5">
                              End Interval
                            </label>
                            <input 
                              type="text"
                              defaultValue={BurmeseSubtitleEngine.formatSrtTimestamp(block.endMs)}
                              onBlur={(e) => handleBlockTimeUpdate(block.id, "end", e.target.value)}
                              className="w-full bg-[#1A2333]/70 border border-[#1E293B] focus:border-blue-500 rounded py-0.5 px-1.5 text-[11px] font-mono font-semibold text-slate-305 outline-none"
                            />
                          </div>
                        </div>

                        {/* Subtitle text input */}
                        <div>
                          <label className="text-[7.5px] font-bold text-slate-500 uppercase block mb-0.5">
                            Burmese Subtitle Text
                          </label>
                          <input 
                            type="text"
                            value={block.rawText}
                            onChange={(e) => handleBlockTextUpdate(block.id, e.target.value)}
                            className="w-full bg-[#1A2333]/90 border border-[#1E293B] focus:border-blue-500 rounded py-1 px-2 text-xs text-slate-200 outline-none font-sans"
                            placeholder="Type caption message..."
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Sleek Glassmorphic VAD / AI forced alignment active overlay */}
      {isAligning && (
        <div className="absolute inset-0 z-50 bg-[#070A13]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in text-left">
          <div className="w-full max-w-sm bg-[#0D1321]/95 border border-purple-500/30 p-5 rounded-2xl shadow-2xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none animate-pulse" />
            
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl animate-bounce">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">AI Voice Forced Alignment</h3>
                <p className="text-[9px] text-slate-400 font-mono">Status: ACTIVE SYNC NODE</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] font-semibold text-slate-350">
                <span className="truncate max-w-[200px]">{aligningStatus}</span>
                <span className="font-mono text-purple-400 font-bold">{aligningProgress}%</span>
              </div>
              {/* Progress track */}
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600 h-full rounded-full transition-all duration-300 shadow-sm shadow-purple-500/50"
                  style={{ width: `${aligningProgress}%` }}
                />
              </div>
            </div>

            {/* Voice stream parameters mockup visualizer */}
            <div className="bg-black/40 border border-slate-800/80 p-2.5 rounded-xl flex items-center justify-center gap-[2px] h-9 select-none">
              {Array.from({ length: 42 }).map((_, idx) => {
                const height = 4 + Math.sin(idx + Date.now() * 0.1) * (14 + (idx % 3) * 4);
                return (
                  <div 
                    key={idx}
                    className="w-[2px] bg-gradient-to-t from-purple-500 to-pink-500 rounded-full animate-pulse"
                    style={{ height: `${Math.min(26, Math.max(4, height))}px` }}
                  />
                );
              })}
            </div>

            <p className="text-[9px] text-slate-400 leading-relaxed font-normal">
              Analyzing audio waveform peaks sequentially to match Burmese transcript syllables. Timestamps are snapped dynamically to speech envelopes while keeping manual block structures intact.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
