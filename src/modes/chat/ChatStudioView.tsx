import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, ShieldCheck, Volume2 } from 'lucide-react';
import { AgentOrchestrator, StructuredAgentResponse } from '../../agents/AgentOrchestrator';
import { eventBus } from '../../core/EventBus';
import { MioCoreState } from '../../types/core';
import { ModelMessage } from '../../types/models';

const INITIAL_MESSAGE_TIME = Date.now() - 60000;

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
      text: 'MIO Web Lab is active. Local-first intelligence, controlled research, project context, secure tools, and model routing are available according to the current Technology Preview configuration.',
      timestamp: INITIAL_MESSAGE_TIME,
    },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state)), []);

  const buildConversationContext = (): ModelMessage[] =>
    messages
      .filter((message) => message.id !== 'msg_init')
      .slice(-12)
      .map((message) => ({ role: message.sender === 'user' ? 'user' as const : 'assistant' as const, content: message.text }));

  const handleSend = async () => {
    const userText = input.trim();
    if (!userText) return;
    const conversation = buildConversationContext();
    setInput('');
    setMessages((prev) => [...prev, { id: `msg_user_${Date.now()}`, sender: 'user', text: userText, timestamp: Date.now() }]);

    const structured = await AgentOrchestrator.processPrompt(userText, conversation);
    setMessages((prev) => [...prev, { id: `msg_mio_${Date.now()}`, sender: 'mio', text: structured.resultText, timestamp: Date.now(), structured }]);

    if (isSpeaking && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(structured.resultText);
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition API is not supported in this browser.');
      return;
    }
    if (isListening) {
      setIsListening(false);
      eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onstart = () => { setIsListening(true); eventBus.emit('CORE_STATE_CHANGE', 'LISTENING'); };
    recognition.onresult = (event: any) => { setInput(event.results[0][0].transcript); setIsListening(false); eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); };
    recognition.onerror = recognition.onend = () => { setIsListening(false); eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); };
    recognition.start();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-800 bg-[#0b1018] flex items-center justify-between text-[10px]">
        <span className="text-gray-500">CONVERSATION CONTEXT // LAST 12 MESSAGES MAX</span>
        <span className="text-cyan-400 font-bold">CORE: {coreState}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-gray-500">{msg.sender === 'user' ? 'USER' : 'MIO CORE'} // {new Date(msg.timestamp).toLocaleTimeString()}</span>
              {msg.sender === 'mio' && <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30"><ShieldCheck size={10} /> VALIDATED</span>}
            </div>

            <div className={`max-w-2xl p-4 rounded-xl leading-relaxed ${msg.sender === 'user' ? 'bg-cyan-950/50 border border-cyan-500/40 text-cyan-200' : 'bg-[#0d121d] border border-gray-800 text-gray-200'}`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.structured && (
                <div className="mt-3 pt-3 border-t border-gray-800 space-y-2 text-[11px]">
                  {msg.structured.modelProvider && (
                    <div className="flex flex-wrap gap-2 text-[9px]">
                      <span className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/30 text-cyan-300">PROVIDER: {msg.structured.modelProvider}</span>
                      <span className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-950/30 text-violet-300">MODEL: {msg.structured.modelName}</span>
                      <span className="px-2 py-0.5 rounded border border-gray-700 bg-gray-900 text-gray-300">SOURCE: {msg.structured.modelSource}</span>
                    </div>
                  )}
                  {msg.structured.emotionalContext && <div className="text-sky-400 italic bg-sky-950/20 p-1.5 rounded border border-sky-500/20">ℹ {msg.structured.emotionalContext}</div>}
                  <div className="bg-[#111726] p-2 rounded border border-gray-800">
                    <span className="text-cyan-400 font-bold block mb-1">PLAN &amp; EXECUTION:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-400">{msg.structured.plan.map((step, idx) => <li key={idx}>{step}</li>)}</ul>
                  </div>
                  {msg.structured.suggestedMode && msg.structured.suggestedMode !== 'CHAT' && (
                    <div className="flex items-center justify-between bg-cyan-950/30 p-2 rounded border border-cyan-500/30">
                      <span className="text-cyan-300">Suggested Studio: <strong>{msg.structured.suggestedMode}</strong></span>
                      <button onClick={() => eventBus.emit('SWITCH_MODE', msg.structured?.suggestedMode)} className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-[10px] cursor-pointer">OPEN {msg.structured.suggestedMode}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#0d121d] border-t border-gray-800">
        <div className="flex items-center gap-2 bg-[#07090e] border border-gray-700 focus-within:border-cyan-400 rounded-xl p-2 transition">
          <button onClick={toggleSpeechRecognition} className={`p-2 rounded-lg cursor-pointer ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-gray-800 text-gray-400 hover:text-cyan-300'}`}>{isListening ? <Mic size={18} /> : <MicOff size={18} />}</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleSend()} placeholder="Ask MIO, research, inspect a project, or route a creative task..." className="flex-1 bg-transparent text-white text-xs outline-none px-2 font-mono placeholder:text-gray-600" />
          <button onClick={() => setIsSpeaking(!isSpeaking)} className={`p-2 rounded-lg cursor-pointer ${isSpeaking ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' : 'text-gray-500 hover:bg-gray-800'}`}><Volume2 size={18} /></button>
          <button onClick={() => void handleSend()} className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg cursor-pointer shadow-md shadow-cyan-500/20"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};
