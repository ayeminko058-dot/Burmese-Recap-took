import React, { useState, useEffect } from "react";
import { 
  Languages, ArrowRightLeft, Copy, Check, Trash2, Share2, Sparkles, Loader2, AlertCircle, ShieldCheck
} from "lucide-react";
import { triggerRewardAd } from "../utils/admob";

interface TranslatorProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  onQuickAccessSettings?: () => void;
}

const LANGUAGES = [
  "English", "Myanmar", "Chinese", "Japanese", "Korean", "Thai", 
  "Indonesian", "Spanish", "French", "German", "Arabic", "Russian", "Hindi"
];

export default function Translator({ onAddNotification, onQuickAccessSettings }: TranslatorProps) {
  const [sourceLang, setSourceLang] = useState<string>("Auto Detect");
  const [targetLang, setTargetLang] = useState<string>("Myanmar");
  const [inputText, setInputText] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "translating" | "completed" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedInput, setCopiedInput] = useState<boolean>(false);
  const [copiedOutput, setCopiedOutput] = useState<boolean>(false);
  
  // Local state API key for status check
  const [apiKeySet, setApiKeySet] = useState<boolean>(false);

  useEffect(() => {
    const key = localStorage.getItem("gemini_api_key");
    setApiKeySet(!!key);
  }, []);

  const handleSwapLanguages = () => {
    if (sourceLang === "Auto Detect") {
      onAddNotification("Cannot Swap", "Cannot swap with 'Auto Detect' selected as the source.", "warning");
      return;
    }
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      onAddNotification("Input Required", "Please enter some text to translate.", "warning");
      return;
    }

    const savedKey = localStorage.getItem("gemini_api_key") || "";
    if (!savedKey) {
      onAddNotification("API Key Missing", "Your Gemini API key is required to use this feature.", "warning");
      setStatus("error");
      setErrorMessage("Gemini API Key is not configured. Please save your key in the Gemini settings first.");
      return;
    }

    triggerRewardAd(
      "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး Gemini AI ဖြင့် အခမဲ့ ဘာသာပြန်ပါ",
      async () => {
        setStatus("translating");
        setErrorMessage(null);
        setTranslatedText("");

        try {
          const response = await fetch("/api/translate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Gemini-API-Key": savedKey,
            },
            body: JSON.stringify({
              text: inputText,
              sourceLang,
              targetLang,
            }),
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
            throw new Error(rawText.substring(0, 100) || "Gateway error from host.");
          }

          if (!response.ok) {
            throw new Error(data.error || "တောင်းဆိုမှု ကြာမြင့်နေပါသည်။ ခဏအကြာမှ ပြန်လည်ကြိုးစားပေးပါ။");
          }

          setTranslatedText(data.translation || "");
          setStatus("completed");
          onAddNotification("Translation Success", "Translated successfully with Gemini.", "success");
        } catch (err: any) {
          console.error(err);
          setStatus("error");
          setErrorMessage(err.message || "An unexpected error occurred.");
          onAddNotification("Translation Failed", err.message || "Could not translate text.", "warning");
        }
      },
      onAddNotification
    );
  };

  const handleCopyInput = () => {
    if (!inputText) return;
    navigator.clipboard.writeText(inputText);
    setCopiedInput(true);
    onAddNotification("Copied", "Source text copied to clipboard.", "success");
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const handleCopyOutput = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopiedOutput(true);
    onAddNotification("Copied", "Translated text copied to clipboard.", "success");
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const handleClear = () => {
    setInputText("");
    setTranslatedText("");
    setStatus("idle");
    setErrorMessage(null);
  };

  const handleShare = async () => {
    if (!translatedText) return;
    const textToShare = `Original: ${inputText}\n\nTranslated (${targetLang}): ${translatedText}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Gemini Translation",
          text: textToShare,
        });
        onAddNotification("Shared", "Translation shared successfully.", "success");
      } catch (err) {
        // Fallback or ignore cancel
      }
    } else {
      navigator.clipboard.writeText(textToShare);
      onAddNotification("Copied", "Shareable content copied to clipboard.", "success");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 pb-28 select-none text-left space-y-5" id="translator-studio">
      
      {/* Header and Branding (Material 3 Card) */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950/45 to-slate-950 p-5 rounded-3xl border border-indigo-500/20 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Languages className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">
              Universal Translator
            </h1>
            <p className="text-[10px] text-slate-300 mt-0.5">
              Secure Local Device Routing • Pure Gemini API Translation Core
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 bg-[#121A2E] text-slate-400 text-[10px] font-mono py-1 px-3.5 rounded-full border border-slate-800">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>No Middleware Tracking</span>
        </div>
      </div>

      {/* API Key Missing Banner info warning */}
      {!apiKeySet && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-400">Gemini API Key Required</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                Translation actions call the official Gemini model directly on-device. Please specify your key to enable translation.
              </p>
            </div>
          </div>
          {onQuickAccessSettings && (
            <button
              onClick={onQuickAccessSettings}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider border border-rose-500/30 shrink-0 self-end sm:self-center transition-colors"
            >
              Configure API settings
            </button>
          )}
        </div>
      )}

      {/* Languages Pickers Deck */}
      <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-center gap-3">
        {/* Source Language Selector */}
        <div className="w-full flex-1 space-y-1">
          <label className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold px-1 block">From</label>
          <select 
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="w-full bg-[#0D1321] text-slate-100 text-xs px-3.5 py-3 rounded-2xl border border-slate-800 focus:border-indigo-505 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            <option value="Auto Detect">✨ Auto Detect Language</option>
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>

        {/* Swap Languages Button */}
        <button
          onClick={handleSwapLanguages}
          disabled={sourceLang === "Auto Detect"}
          className={`p-3 rounded-2xl border transition-all mt-4 self-center shrink-0 ${
            sourceLang === "Auto Detect"
              ? "bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed"
              : "bg-[#0D1321] border-slate-800 text-indigo-400 hover:text-white hover:border-indigo-500 hover:bg-indigo-500/10 active:scale-95"
          }`}
          title="Swap Languages"
        >
          <ArrowRightLeft className="w-4 h-4 transform rotate-90 sm:rotate-0" />
        </button>

        {/* Target Language Selector */}
        <div className="w-full flex-1 space-y-1">
          <label className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold px-1 block">To</label>
          <select 
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full bg-[#0D1321] text-slate-100 text-xs px-3.5 py-3 rounded-2xl border border-slate-800 focus:border-indigo-505 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Input and Output Split Views Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Source Text Input */}
        <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 space-y-3 flex flex-col justify-between min-h-[220px]">
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex justify-between items-center select-none">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Source Content</span>
              {inputText && (
                <span className="text-[8px] text-slate-500 font-mono">{inputText.length} characters</span>
              )}
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Enter text here to translate...`}
              className="w-full flex-1 min-h-[140px] bg-transparent text-xs text-white placeholder-slate-500 resize-none border-none outline-none focus:ring-0 leading-relaxed font-sans"
            />
          </div>
          
          <div className="flex justify-between items-center pt-2 border-t border-slate-800/50 select-none">
            <button
              onClick={handleClear}
              disabled={!inputText}
              className={`p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ${
                !inputText ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleCopyInput}
              disabled={!inputText}
              className={`p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
                !inputText ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              {copiedInput ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Translation Output */}
        <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 space-y-3 flex flex-col justify-between min-h-[220px] relative">
          
          {/* Action indicator loop */}
          {status === "translating" && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center space-y-2 z-10 animate-fade-in select-none">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-xs font-bold text-slate-200">Gemini translates...</p>
              <p className="text-[9px] text-slate-400 font-mono">Invoking model: gemini-3.5-flash</p>
            </div>
          )}

          <div className="space-y-2 flex-1 flex flex-col select-text">
            <div className="flex justify-between items-center select-none">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold">Translated Output</span>
              {translatedText && (
                <span className="text-[8px] text-slate-500 font-mono">{translatedText.length} characters</span>
              )}
            </div>
            
            {errorMessage ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-xs text-rose-300 flex items-start gap-2 max-w-full overflow-hidden select-text font-mono">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="break-all leading-normal">{errorMessage}</span>
              </div>
            ) : (
              <textarea
                readOnly
                value={translatedText}
                placeholder="Translation will appear here..."
                className="w-full flex-1 min-h-[140px] bg-transparent text-xs text-indigo-200 placeholder-slate-600 resize-none border-none outline-none focus:ring-0 leading-relaxed font-sans cursor-default select-text"
              />
            )}
          </div>
          
          <div className="flex justify-between items-center pt-2 border-t border-slate-800/50 select-none">
            <button
              onClick={handleShare}
              disabled={!translatedText}
              className={`p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors ${
                !translatedText ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleCopyOutput}
              disabled={!translatedText}
              className={`p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
                !translatedText ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              {copiedOutput ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

      </div>

      {/* Main Trigger Translate Button */}
      <button
        onClick={handleTranslate}
        disabled={status === "translating" || !inputText.trim()}
        className={`w-full py-4 px-6 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
          status === "translating" || !inputText.trim()
            ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
            : "bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 shadow-lg shadow-indigo-500/10 cursor-pointer"
        }`}
      >
        {status === "translating" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>Consulting translation matrices...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-white" />
            <span>Translate with Gemini</span>
          </>
        )}
      </button>

    </div>
  );
}
