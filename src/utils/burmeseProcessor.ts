/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Precise rule-based Burmese NLP Segmenter & Proportional Timeline Aligner
 * Exactly matching specified HTML script block requirements.
 */

export interface BurmeseToken {
  text: string;
  isWordOrSyllable: boolean;
}

export interface AlignmentResult {
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

/**
 * Checks if a character is a Unicode Burmese Base Consonant or independent vowel
 */
export function isBurmeseBase(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 0x1000 && code <= 0x1021) || 
         (code >= 0x1023 && code <= 0x102A) || 
         (code === 0x103F) || 
         (code >= 0x1040 && code <= 0x1049) || 
         (code >= 0x104C && code <= 0x104F);
}

/**
 * Checks if a character is a combining sign (vowels, medials, asat, tone marks, virama)
 */
export function isBurmeseCombining(char: string): boolean {
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
}

/**
 * Segments Burmese text into logical syllable components using standard syllable boundary rules.
 */
export function segmentText(text: string): BurmeseToken[] {
  const tokens: BurmeseToken[] = []; 
  let i = 0; 
  const len = text.length; 
  let currentSyllable = "";
  
  function flushCurrent() { 
    if (currentSyllable.length > 0) { 
      tokens.push({ text: currentSyllable, isWordOrSyllable: true }); 
      currentSyllable = ""; 
    } 
  }
  
  while (i < len) {
    const c = text[i];
    if (c === '\u1031' && i + 1 < len && isBurmeseBase(text[i + 1])) { 
      flushCurrent(); 
      currentSyllable += c + text[i + 1]; 
      i += 2; 
      continue; 
    }
    if (isBurmeseBase(c)) {
      let isKilledConsonant = false;
      if (currentSyllable.length > 0) {
        if (i + 1 < len && text[i + 1] === '\u103A') isKilledConsonant = true;
        else if (i + 2 < len && text[i + 2] === '\u103A' && isBurmeseCombining(text[i + 1])) isKilledConsonant = true;
        else if (i + 1 < len && text[i + 1] === '\u1039') isKilledConsonant = true;
      }
      if (isKilledConsonant) currentSyllable += c; 
      else { 
        flushCurrent(); 
        currentSyllable += c; 
      } 
      i++;
    } else if (isBurmeseCombining(c)) { 
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
        while (i < len && !isBurmeseBase(text[i]) && !isBurmeseCombining(text[i]) && /[a-zA-Z0-9]/.test(text[i])) { 
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
}

/**
 * Validates and adjusts syllable grouping to handle double-stacked consonants and subjoined scripts.
 * Applies split weight and break calculations to format lines.
 */
export function applyStackingRules(text: string): string {
  const trimmed = text.trim(); 
  const tokens = segmentText(trimmed); 
  const wordCount = tokens.filter(t => t.isWordOrSyllable).length;
  if (wordCount < 10) return trimmed;
  
  let bestTokenIdx = -1; 
  let minCost = Infinity; 
  const idealSyllables = wordCount / 2.0; 
  let currentSyllableCount = 0;
  
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i - 1].isWordOrSyllable) currentSyllableCount++;
    if (isBurmeseCombining(tokens[i].text[0])) continue;
    
    const syllableDiff = currentSyllableCount - idealSyllables; 
    let cost = syllableDiff * syllableDiff * 5.0;
    const prevTokenText = tokens[i - 1].text.trim();
    
    if (prevTokenText === "၊") cost -= 40.0; 
    if (prevTokenText === "ပြီး" || prevTokenText === "ပြီးတော့") cost -= 30.0; 
    if (tokens[i - 1].text === " ") cost -= 15.0;
    
    if (cost < minCost) { 
      minCost = cost; 
      bestTokenIdx = i; 
    }
  }
  
  if (bestTokenIdx === -1) bestTokenIdx = Math.floor(tokens.length / 2);
  
  const leftText = tokens.slice(0, bestTokenIdx).map(t => t.text).join("").trim(); 
  const rightText = tokens.slice(bestTokenIdx).map(t => t.text).join("").trim();
  
  return rightText.length === 0 ? leftText : (leftText + "\n" + rightText);
}

/**
 * Segments a full script text into multiple readable caption cards,
 * distributing the total duration proportionally.
 */
export function performProportionalAutoAlignment(
  text: string,
  totalDurationSeconds: number
): AlignmentResult[] {
  if (!text.trim()) return [];
  
  const totalMs = totalDurationSeconds * 1000;
  const segments: string[] = []; 
  let currentChunk = "";
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "။") { 
      currentChunk += char; 
      if (currentChunk.trim()) segments.push(currentChunk.trim()); 
      currentChunk = ""; 
    }
    else if (char === ".") { 
      if (currentChunk.trim()) segments.push(currentChunk.trim()); 
      currentChunk = ""; 
    }
    else currentChunk += char;
  }
  if (currentChunk.trim()) segments.push(currentChunk.trim()); 
  
  if (segments.length === 0) return [];
  
  const totalChars = segments.reduce((sum, s) => sum + s.length, 0); 
  let progressMs = 0;
  
  return segments.map((segText, index) => {
    const charWeight = segText.length; 
    const blockDuration = totalChars > 0 ? (charWeight / totalChars) * totalMs : 0;
    let blockEnd = progressMs + Math.round(blockDuration); 
    
    if (index === segments.length - 1) blockEnd = totalMs;
    
    const resultBlock = { 
      text: applyStackingRules(segText), 
      startMs: progressMs, 
      endMs: blockEnd, 
      durationMs: blockEnd - progressMs 
    };
    progressMs = blockEnd; 
    return resultBlock;
  });
}

/**
 * Translates milliseconds into standard SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(ms: number): string {
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
}

/**
 * Compiles a list of SubtitleBlocks into a valid downloadable .SRT string
 */
export function compileSrtString(blocks: { text: string; startMs: number; endMs: number }[]): string {
  return blocks
    .map((block, index) => {
      const lineNum = index + 1;
      const start = formatSrtTimestamp(block.startMs);
      const end = formatSrtTimestamp(block.endMs);
      return `${lineNum}\n${start} --> ${end}\n${block.text}\n`;
    })
    .join("\n");
}
