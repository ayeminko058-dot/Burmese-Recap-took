import React, { useState } from "react";
import { 
  Folder, File, Copy, Check, Download, Info, Terminal, Settings, Layers, Code, Play, CheckCircle2 
} from "lucide-react";
import { FLUTTER_CODEBASE, FlutterFile } from "../utils/flutterSourceCode";

interface DeveloperConsoleProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
}

export default function DeveloperConsole({ onAddNotification }: DeveloperConsoleProps) {
  const [selectedFileIndex, setSelectedFileIndex] = useState(3); // default to subtitle_viewmodel.dart for parity logic checking
  const [justCopied, setJustCopied] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"code" | "spec">("code");

  const currentFile = FLUTTER_CODEBASE[selectedFileIndex];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentFile.content);
    setJustCopied(true);
    onAddNotification("Code Copied", `${currentFile.name} added to clipboard. Ready for Android Studio / VSCode!`, "success");
    setTimeout(() => setJustCopied(false), 2000);
  };

  const handleExportZip = () => {
    // Generate simple readable catalog of our source files
    let textDump = `======================================================\n`;
    textDump += `   BURMESE RECAP TOOL (PREMIUM Creator Studio)       \n`;
    textDump += `   CLEAN ARCHITECTURE & MVVM FLUTTER CODE EXPORTER   \n`;
    textDump += `======================================================\n\n`;

    FLUTTER_CODEBASE.forEach((file) => {
      textDump += `\n\n---------------------------------------------\n`;
      textDump += `FILE PATH: ${file.path}\n`;
      textDump += `---------------------------------------------\n\n`;
      textDump += file.content;
      textDump += `\n`;
    });

    const blob = new Blob([textDump], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "burmese_recap_flutter_mvvm_workspace.txt";
    link.click();
    URL.revokeObjectURL(url);

    onAddNotification("Workspace Exported", "Downloaded single flat directory directory file containing all source files.", "success");
  };

  return (
    <div className="flex flex-col h-full bg-[#0E1321] border border-[#1E293B] rounded-3xl overflow-hidden shadow-2xl h-[780px]" id="developer-workspace">
      {/* Workspace Header */}
      <div className="bg-[#090D18] p-4 border-b border-[#1E293B] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-1.5">
              Flutter Architecture Exporter Studio
              <span className="text-[9px] bg-blue-500/15 text-blue-400 py-0.5 px-2 rounded-full font-mono font-medium border border-blue-500/10 uppercase">
                MVVM
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Statically typed, Play Store ready (Android 14/15+ SDK 34/35+)</p>
          </div>
        </div>

        <div className="flex bg-[#121A2C] rounded-lg p-0.5 border border-[#1E293B]">
          <button
            onClick={() => setActiveWorkspaceTab("code")}
            className={`text-[10px] font-semibold py-1.5 px-3.5 rounded-md transition-colors ${
              activeWorkspaceTab === "code" 
                ? "bg-blue-600 text-white" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Flutter Files
          </button>
          <button
            onClick={() => setActiveWorkspaceTab("spec")}
            className={`text-[10px] font-semibold py-1.5 px-3.5 rounded-md transition-colors ${
              activeWorkspaceTab === "spec" 
                ? "bg-blue-600 text-white" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Play Store Compliance Guidelines
          </button>
        </div>
      </div>

      {activeWorkspaceTab === "code" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* File explorer sidebar */}
          <div className="w-[200px] border-r border-[#1E293B] bg-[#090D18]/45 p-3 flex flex-col shrink-0 select-none">
            <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2.5 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-blue-500 fill-current" />
              Flutter Project Root
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-1 text-xs">
              {FLUTTER_CODEBASE.map((file, idx) => {
                const isSelected = selectedFileIndex === idx;
                const pathParts = file.path.split("/");
                const fileName = pathParts[pathParts.length - 1];
                const fileDir = pathParts.slice(0, -1).join("/");

                return (
                  <button
                    key={file.path}
                    onClick={() => {
                      setSelectedFileIndex(idx);
                      onAddNotification("File Loaded", `Inspecting design of: ${fileName}`, "info");
                    }}
                    className={`w-full text-left p-2 rounded-xl transition-colors flex flex-col ${
                      isSelected 
                        ? "bg-blue-600/10 text-blue-300 border border-blue-500/25" 
                        : "text-slate-400 hover:bg-[#121A2C]/60 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold truncate">
                      <File className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-blue-400" : "text-slate-500"}`} />
                      <span className="truncate">{fileName}</span>
                    </div>
                    {fileDir && (
                      <span className="text-[8px] opacity-50 block truncate ml-5 mt-0.5 font-mono">{fileDir}/</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleExportZip}
              className="mt-4 bg-[#121A2C] hover:bg-[#1C283F] text-slate-200 text-[10px] py-2.5 rounded-xl border border-[#1E293B] flex items-center justify-center gap-1.5 w-full shrink-0 font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              Export Source Files
            </button>
          </div>

          {/* Interactive Code Editor pane */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0D15]">
            <div className="bg-[#090D18]/90 p-2 border-b border-[#1E293B] flex items-center justify-between shrink-0 font-mono text-[9px] text-slate-500">
              <span className="text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 uppercase font-bold">
                {currentFile.language}
              </span>
              <span className="truncate max-w-[250px]">{currentFile.path}</span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 bg-[#121D32] hover:bg-[#1A2E4B] text-slate-200 font-bold px-2.5 py-1 rounded-lg border border-blue-500/10 transition-colors"
              >
                {justCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-blue-400" />}
                {justCopied ? "Copied" : "Copy Source"}
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed select-text text-left">
              <pre className="text-slate-300">
                <code>
                  {currentFile.content.split("\n").map((line, idx) => (
                    <div key={idx} className="flex hover:bg-slate-900/40 py-0.5 px-1 rounded">
                      <span className="w-8 select-none text-slate-650 inline-block text-right pr-3.5">{idx + 1}</span>
                      <span className="text-slate-200 flex-1 whitespace-pre-wrap">{line}</span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#070B13] max-w-4xl mx-auto text-left leading-relaxed text-slate-300">
          <div className="bg-[#1A2333] rounded-2xl p-5 border border-slate-800 space-y-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Instant Production Deployments checks (API 34/35+)
            </h2>
            <p className="text-xs text-slate-400">
              To pass Google Play Console Production Reviews instantly without privacy queries, we configured precise manifest settings and dynamic checking.
            </p>
            <ul className="space-y-2 text-xs text-slate-350 list-disc list-inside">
              <li><b>usesCleartextTraffic="true"</b>: Essential for Edge TTS stream fetching which uses secure micro-services.</li>
              <li><b>FOREGROUND_SERVICE and type 'dataSync'</b>: Required for continuing downloads and stitching TTS bytes in the background when the phone is locked.</li>
              <li><b>Granular Permissions</b>: {"For api >= 33, standard storage request crashes and generates rejections. The source code requests media collections cleanly."}</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#090D18] p-4.5 rounded-2xl border border-slate-800/80 space-y-2">
              <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                <Code className="w-4 h-4" />
                Syllable Boundaries Logic
              </h3>
              <p className="text-[11px] text-slate-450">
                Pure rule-based Burmese NLP is complex because Unicode places bases, dependent vowels, and stacking Viramas in arbitrary order. We avoid standard regex word bounds which fail Unicode ranges. Our Dart segmenter parses char-by-char, tracking stacking boundaries correctly.
              </p>
            </div>

            <div className="bg-[#090D18] p-4.5 rounded-2xl border border-slate-800/80 space-y-2">
              <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Foreground Buffer Stitching
              </h3>
              <p className="text-[11px] text-slate-450">
                To bypass edge-tts Vercel constraints for scripts over 1,000 characters, our system acts as a pipeline sequencer. It splits text block arrays, queries consecutive binary stream chunks, aggregates them into indexed raw byte lists {"(List<int>)"}, and compiles them natively into a single file path.
              </p>
            </div>
          </div>

          <div className="bg-[#1E293B]/25 p-4 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex gap-3 items-start">
            <Info className="w-4.5 h-4.5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-300">Clean Architecture & Dependencies Injection Guidelines</p>
              <p className="mt-1">
                The exporter organizes code cleanly. ViewModels represent <b>Presentation States</b>, which bind directly to standard Flutter views with <code>ChangeNotifierProvider</code>. Services and Permission Layers reside inside the <b>Core Infra Layer</b>, resolved using <code>GetIt</code> inside <code>main.dart</code>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
