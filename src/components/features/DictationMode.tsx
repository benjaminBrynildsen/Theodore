import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Pause, Play, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

export function DictationMode({ chapterId }: { chapterId: string }) {
  const { updateChapter, chapters } = useStore();
  const chapter = chapters.find(c => c.id === chapterId);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rawText, setRawText] = useState('');
  const [refinedText, setRefinedText] = useState('');
  const [refining, setRefining] = useState(false);
  const [duration, setDuration] = useState(0);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Check for browser speech recognition support
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  const startListening = () => {
    if (!supported) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setRawText(transcript);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (isListening && !isPaused) {
        recognition.start();
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setDuration(0);

    // Timer
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsListening(false);
    setIsPaused(false);
  };

  const togglePause = () => {
    if (isPaused) {
      recognitionRef.current?.start();
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      recognitionRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    }
    setIsPaused(!isPaused);
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const refineText = async () => {
    if (!rawText.trim()) return;
    setRefining(true);
    await new Promise(r => setTimeout(r, 2000));

    // Mock AI refinement — real version sends to API
    // Removes filler words, adds punctuation, formats into paragraphs
    const cleaned = rawText
      .replace(/\b(um|uh|like|you know|basically|actually|so|well)\b\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Split into sentences and form paragraphs
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join(' '));
    }

    setRefinedText(paragraphs.join('\n\n'));
    setRefining(false);
  };

  const appendToChapter = () => {
    if (!refinedText || !chapter) return;
    const newProse = chapter.prose
      ? chapter.prose + '\n\n' + refinedText
      : refinedText;
    updateChapter(chapterId, {
      prose: newProse,
      status: 'human-edited',
      updatedAt: new Date().toISOString(),
    });
    setRawText('');
    setRefinedText('');
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!supported) {
    return (
      <div className="p-4 text-center text-text-tertiary text-xs">
        <MicOff size={20} className="mx-auto mb-2 opacity-50" />
        Speech recognition not supported in this browser. Try Chrome or Edge.
      </div>
    );
  }

  return (
    <div className="border-t border-black/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Mic size={13} className={isListening ? 'text-red-500' : 'text-text-tertiary'} />
        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Dictation Mode</span>
        {isListening && <span className="text-[10px] font-mono text-red-500 animate-pulse">● REC {formatTime(duration)}</span>}
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-3">
        {!isListening ? (
          <button
            onClick={startListening}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-xs font-medium flex items-center justify-center gap-2 hover:bg-red-600 transition-all"
          >
            <Mic size={14} /> Start Dictating
          </button>
        ) : (
          <>
            <button
              onClick={togglePause}
              className={cn('flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all',
                isPaused ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-secondary'
              )}
            >
              {isPaused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
            </button>
            <button
              onClick={stopListening}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-xs font-medium flex items-center justify-center gap-2 hover:bg-red-600"
            >
              <MicOff size={14} /> Stop
            </button>
          </>
        )}
      </div>

      {/* Raw transcript */}
      {rawText && (
        <div className="mb-3 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-tertiary">Raw transcript</span>
            <button onClick={() => setRawText('')} className="text-text-tertiary hover:text-error"><Trash2 size={11} /></button>
          </div>
          <div className="glass-pill rounded-xl p-3 text-xs text-text-secondary max-h-32 overflow-y-auto leading-relaxed">
            {rawText}
          </div>
          <div className="text-[10px] text-text-tertiary mt-1">{rawText.split(/\s+/).length} words</div>
        </div>
      )}

      {/* Refine button */}
      {rawText && !refinedText && !isListening && (
        <button
          onClick={refineText}
          disabled={refining}
          className="w-full py-2 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center justify-center gap-2 hover:shadow-md transition-all disabled:opacity-50 mb-3"
        >
          {refining ? <><Loader2 size={13} className="animate-spin" /> Refining...</> : <><Sparkles size={13} /> Refine into Prose</>}
        </button>
      )}

      {/* Refined output */}
      {refinedText && (
        <div className="animate-fade-in">
          <div className="text-[10px] text-text-tertiary mb-1">Refined prose</div>
          <div className="glass-pill rounded-xl p-3 text-sm font-serif text-text-primary max-h-40 overflow-y-auto leading-[1.8] whitespace-pre-line mb-3">
            {refinedText}
          </div>
          <button
            onClick={appendToChapter}
            className="w-full py-2 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center justify-center gap-2 hover:shadow-md transition-all"
          >
            Append to Chapter
          </button>
        </div>
      )}
    </div>
  );
}
