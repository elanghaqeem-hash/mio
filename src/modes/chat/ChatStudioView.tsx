import React, { useState, useRef, useEffect } from 'react';
import { AgentOrchestrator, StructuredAgentResponse } from '../../agents/AgentOrchestrator';
import { Send, Mic, MicOff, Volume2, ShieldCheck } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { MioCoreState } from '../../types/core';

interface Message {
  id: string;
  sender: 'user' | 'mio';
  text: string;
  timestamp: number;
  structured?: StructuredAgentResponse;
}

export const ChatStudioView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_init',
      sender: 'mio',
      text: 'Mio V2 operating environment initialized. Core is active in ASSISTIVE mode with strict L0-L5 security hierarchy. How may I assist your logical inquiry or creative project today?',
      timestamp: Date.now() - 60000,
    },
  ]);

  const [input, setInput] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [, setCoreState] = useState<MioCoreState>('IDLE');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const unsub = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => {
      setCoreState(state);
    });
    return unsub;
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input;
    setInput('');

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);

    const structured = await AgentOrchestrator.processPrompt(userText);

    const mioMsg: Message = {
      id: `msg_${Date.now() + 1}`,
      sender: 'mio',
      text: structured.resultText,
      timestamp: Date.now(),
      structured,
    };

    setMessages((prev) => [...prev, mioMsg]);

    if (isSpeaking && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(structured.resultText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition API not supported in this browser.');
      return;
    }

    if (!isListening) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onstart = () => {
        setIsListening(true);
        eventBus.emit('CORE_STATE_CHANGE', 'LISTENING');
      };
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      };
      recognition.onerror = () => {
        setIsListening(false);
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      };
      recognition.onend = () => {
        setIsListening(false);
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      };
      recognition.start();
    } else {
      setIsListening(false);
      eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:p-4 space-y-4 overscroll-contain">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 mb-1 max-w-full">
              <span className="text-[9px] sm:text-[10px] text-gray-500 truncate">
                {msg.sender === 'user' ? 'USER' : 'MIO CORE'} // {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              {msg.sender === 'mio' && (
                <span className="flex shrink-0 items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  <ShieldCheck size={10} /> VALIDATED
                </span>
              )}
            </div>

            <div
              className={`w-fit max-w-[94%] sm:max-w-2xl p-3 sm:p-4 rounded-xl leading-relaxed break-words ${
                msg.sender === 'user'
                  ? 'bg-cyan-950/50 border border-cyan-500/40 text-cyan-200'
                  : 'bg-[#0d121d] border border-gray-800 text-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>

              {msg.structured && (
                <div className="mt-3 pt-3 border-t border-gray-800 space-y-2 text-[11px] min-w-0">
                  {msg.structured.emotionalContext && (
                    <div className="text-sky-400 italic bg-sky-950/20 p-2 rounded border border-sky-500/20 break-words">
                      ℹ {msg.structured.emotionalContext}
                    </div>
                  )}

                  <div className="bg-[#111726] p-2 rounded border border-gray-800 min-w-0">
                    <span className="text-cyan-400 font-bold block mb-1">PLAN &amp; EXECUTION:</span>
                    <ul className="list-disc list-inside space-y-1 text-gray-400 break-words">
                      {msg.structured.plan.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>

                  {msg.structured.suggestedMode && msg.structured.suggestedMode !== 'CHAT' && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-cyan-950/30 p-2 rounded border border-cyan-500/30">
                      <span className="text-cyan-300 break-words">
                        Suggested Studio: <strong>{msg.structured.suggestedMode}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => eventBus.emit('SWITCH_MODE', msg.structured?.suggestedMode)}
                        className="min-h-10 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-[10px] cursor-pointer touch-manipulation shrink-0"
                      >
                        OPEN {msg.structured.suggestedMode} STUDIO
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 p-2.5 sm:p-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-[#0d121d] border-t border-gray-800">
        <div className="flex items-end gap-1.5 sm:gap-2 bg-[#07090e] border border-gray-700 focus-within:border-cyan-400 rounded-xl p-1.5 sm:p-2 transition">
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            className={`h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg transition cursor-pointer touch-manipulation ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'hover:bg-gray-800 text-gray-400 hover:text-cyan-300 active:bg-gray-800'
            }`}
            title={isListening ? 'Stop Listening' : 'Voice Input (STT)'}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            {isListening ? <Mic size={19} /> : <MicOff size={19} />}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Ask MIO anything..."
            className="flex-1 min-w-0 max-h-28 resize-none bg-transparent text-white text-base sm:text-xs leading-5 outline-none px-1.5 py-2.5 sm:py-2 font-mono placeholder:text-gray-600"
          />

          <button
            type="button"
            onClick={() => setIsSpeaking(!isSpeaking)}
            className={`hidden xs:inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition cursor-pointer touch-manipulation ${
              isSpeaking ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' : 'text-gray-500 hover:bg-gray-800'
            }`}
            title={isSpeaking ? 'TTS Voice Enabled' : 'Enable TTS Voice'}
            aria-label={isSpeaking ? 'Disable text to speech' : 'Enable text to speech'}
          >
            <Volume2 size={18} />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-lg transition cursor-pointer disabled:cursor-default touch-manipulation shadow-md shadow-cyan-500/20"
            title="Send Directive"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
