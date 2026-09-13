import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CircleOff, Download, Mic, MicOff, Send, ShieldCheck, Volume2, X } from 'lucide-react';
import { AgentOrchestrator, StructuredAgentResponse } from '../../agents/AgentOrchestrator';
import { eventBus } from '../../core/EventBus';
import { EvidencePackageBuilder, type MioEvidencePackage } from '../../project/EvidencePackage';
import { ProjectKnowledgeIndex } from '../../project/ProjectKnowledgeIndex';
import { ProjectManager } from '../../project/ProjectManager';
import { MioCoreState } from '../../types/core';
import { ModelMessage } from '../../types/models';
import { EvidenceInspector } from './EvidenceInspector';

const INITIAL_MESSAGE_TIME = Date.now() - 60000;

interface Message {
  id: string;
  sender: 'user' | 'mio';
  text: string;
  timestamp: number;
  structured?: StructuredAgentResponse;
  evidencePackage?: MioEvidencePackage;
}

function persistentExclusions(): string[] {
  const project = ProjectManager.getProject();
  return Object.values(project.knowledgeGovernance?.sources ?? {}).filter((source) => !source.included).map((source) => source.assetId);
}

function downloadEvidencePackage(pkg: MioEvidencePackage): void {
  const blob = new Blob([EvidencePackageBuilder.serialize(pkg)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pkg.packageId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const ChatStudioView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([{ id: 'msg_init', sender: 'mio', text: 'MIO Web Lab is active. Local-first intelligence, controlled research, project context, secure tools, and model routing are available according to the current Technology Preview configuration.', timestamp: INITIAL_MESSAGE_TIME }]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [projectKnowledgeEnabled, setProjectKnowledgeEnabled] = useState(true);
  const [excludedAssetIds, setExcludedAssetIds] = useState<string[]>(persistentExclusions);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state)), []);
  useEffect(() => eventBus.on('PROJECT_UPDATED', () => setExcludedAssetIds(persistentExclusions())), []);

  const buildConversationContext = (): ModelMessage[] => messages.filter((message) => message.id !== 'msg_init').slice(-12).map((message) => ({ role: message.sender === 'user' ? 'user' as const : 'assistant' as const, content: message.text }));

  const excludeSource = (assetId: string) => {
    if (ProjectManager.setKnowledgeSourceIncluded(assetId, false)) setExcludedAssetIds(persistentExclusions());
  };

  const resetExclusions = () => {
    for (const assetId of excludedAssetIds) ProjectManager.setKnowledgeSourceIncluded(assetId, true);
    setExcludedAssetIds([]);
  };

  const handleSend = async () => {
    const userText = input.trim();
    if (!userText) return;
    const conversation = buildConversationContext();
    const exclusionsAtRequest = [...excludedAssetIds];
    const projectKnowledgeAtRequest = projectKnowledgeEnabled;
    setInput('');
    setMessages((prev) => [...prev, { id: `msg_user_${Date.now()}`, sender: 'user', text: userText, timestamp: Date.now() }]);

    const structured = await AgentOrchestrator.processPrompt(userText, conversation, { projectKnowledgeEnabled: projectKnowledgeAtRequest, excludedAssetIds: exclusionsAtRequest, contextBudgetChars: 4800 });
    const project = ProjectManager.getProject();
    const snapshotContext = projectKnowledgeAtRequest
      ? ProjectKnowledgeIndex.retrieve(project, userText, { excludedAssetIds: exclusionsAtRequest, contextBudgetChars: 4800 })
      : { query: userText, hits: [], contextText: '', applicationContext: undefined };
    const evidencePackage = structured.evidenceAudit && snapshotContext.hits.length > 0
      ? EvidencePackageBuilder.build({ project, query: userText, responseText: structured.resultText, projectContext: snapshotContext, evidenceAudit: structured.evidenceAudit })
      : undefined;
    setMessages((prev) => [...prev, { id: `msg_mio_${Date.now()}`, sender: 'mio', text: structured.resultText, timestamp: Date.now(), structured, evidencePackage }]);

    if (isSpeaking && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(structured.resultText);
      utterance.rate = 1; utterance.pitch = 1; window.speechSynthesis.speak(utterance);
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech Recognition API is not supported in this browser.'); return; }
    if (isListening) { setIsListening(false); eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; recognition.interimResults = false;
    recognition.onstart = () => { setIsListening(true); eventBus.emit('CORE_STATE_CHANGE', 'LISTENING'); };
    recognition.onresult = (event: any) => { setInput(event.results[0][0].transcript); setIsListening(false); eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); };
    recognition.onerror = recognition.onend = () => { setIsListening(false); eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); };
    recognition.start();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#07090e] font-mono text-xs">
      <div className="flex items-center justify-between border-b border-gray-800 bg-[#0b1018] px-4 py-2 text-[10px]">
        <div className="flex items-center gap-3 text-gray-500">
          <span>CONVERSATION CONTEXT // LAST 12 MESSAGES MAX</span>
          <button onClick={() => setProjectKnowledgeEnabled((current) => !current)} className={`flex items-center gap-1 rounded border px-2 py-1 ${projectKnowledgeEnabled ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`} title="Project knowledge is retrieved only when relevant and remains application data, not instruction authority.">
            {projectKnowledgeEnabled ? <BookOpen size={11} /> : <CircleOff size={11} />} PROJECT KNOWLEDGE {projectKnowledgeEnabled ? 'ON' : 'OFF'}
          </button>
          {excludedAssetIds.length > 0 && <button onClick={resetExclusions} className="rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-amber-300">{excludedAssetIds.length} PERSISTENTLY EXCLUDED · RESET</button>}
        </div>
        <span className="font-bold text-cyan-400">CORE: {coreState}</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] text-gray-500">{msg.sender === 'user' ? 'USER' : 'MIO CORE'} // {new Date(msg.timestamp).toLocaleTimeString()}</span>
              {msg.sender === 'mio' && <span className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] text-emerald-400"><ShieldCheck size={10} /> VALIDATED</span>}
            </div>

            <div className={`max-w-2xl rounded-xl p-4 leading-relaxed ${msg.sender === 'user' ? 'border border-cyan-500/40 bg-cyan-950/50 text-cyan-200' : 'border border-gray-800 bg-[#0d121d] text-gray-200'}`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.structured && (
                <div className="mt-3 space-y-2 border-t border-gray-800 pt-3 text-[11px]">
                  {msg.structured.modelProvider && <div className="flex flex-wrap gap-2 text-[9px]"><span className="rounded border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5 text-cyan-300">PROVIDER: {msg.structured.modelProvider}</span><span className="rounded border border-violet-500/30 bg-violet-950/30 px-2 py-0.5 text-violet-300">MODEL: {msg.structured.modelName}</span><span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-300">SOURCE: {msg.structured.modelSource}</span>{msg.structured.webSearchUsed !== undefined && <span className={`rounded border px-2 py-0.5 ${msg.structured.webSearchUsed ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>WEB SEARCH: {msg.structured.webSearchUsed ? 'USED' : 'NOT USED'}</span>}</div>}

                  {msg.structured.citations && msg.structured.citations.length > 0 && <div className="rounded border border-emerald-500/20 bg-emerald-950/10 p-2"><div className="mb-1 font-bold text-emerald-300">WEB SOURCES</div><div className="space-y-1">{msg.structured.citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="block truncate text-[9px] text-cyan-300 underline decoration-cyan-500/40 hover:text-cyan-200">{citation.title || citation.url}</a>)}</div></div>}

                  {msg.structured.projectContextEnabled !== undefined && <div className="flex flex-wrap items-center gap-2 text-[9px]"><span className={`rounded border px-2 py-0.5 ${msg.structured.projectContextEnabled ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>PROJECT CONTEXT: {msg.structured.projectContextEnabled ? 'ENABLED' : 'DISABLED'}</span><span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-400">SOURCES USED: {msg.structured.projectContextSources ?? 0}</span></div>}

                  {msg.structured.evidenceAudit && <EvidenceInspector audit={msg.structured.evidenceAudit} messageId={msg.id} />}

                  {msg.evidencePackage && (
                    <div className="flex items-center justify-between rounded border border-violet-500/20 bg-violet-950/10 p-2 text-[9px]">
                      <div><div className="font-bold text-violet-300">AUDIT SNAPSHOT · {msg.evidencePackage.integrity.fingerprint}</div><div className="mt-0.5 text-gray-600">Observable evidence and governance metadata only · no private chain-of-thought · non-cryptographic fingerprint.</div></div>
                      <button onClick={() => downloadEvidencePackage(msg.evidencePackage!)} className="flex shrink-0 items-center gap-1 rounded border border-violet-500/30 px-2 py-1 text-violet-300 hover:bg-violet-950/30"><Download size={10} /> EXPORT EVIDENCE JSON</button>
                    </div>
                  )}

                  {msg.structured.knowledgeSources && msg.structured.knowledgeSources.length > 0 && (
                    <div className="rounded border border-gray-800 bg-[#0a0f18] p-2">
                      <div className="mb-2 flex items-center gap-1.5 font-bold text-cyan-400"><BookOpen size={12} /> PROJECT SOURCES USED</div>
                      <div className="space-y-1.5">
                        {msg.structured.knowledgeSources.map((source) => (
                          <div key={`${msg.id}-${source.assetId}-${source.sourceUri}`} className="flex items-start justify-between gap-3 rounded border border-gray-800 bg-[#101622] p-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2"><span className="truncate text-gray-200">{source.name}</span><span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${source.trust === 'VERIFIED' ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/50 text-amber-300'}`}>{source.trust}</span><span className={`rounded px-1.5 py-0.5 text-[8px] ${source.freshness === 'CURRENT' ? 'bg-cyan-950/50 text-cyan-300' : source.freshness === 'STALE' ? 'bg-rose-950/50 text-rose-300' : 'bg-gray-900 text-gray-500'}`}>{source.freshness}</span></div>
                              <div className="mt-1 truncate text-[9px] text-gray-500">{source.sourceUri}</div><div className="mt-0.5 text-[9px] text-gray-600">RELEVANCE SCORE: {source.score}</div>
                            </div>
                            <button onClick={() => excludeSource(source.assetId)} className="flex shrink-0 items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[9px] text-gray-400 hover:border-amber-500/40 hover:text-amber-300" title="Persistently exclude this asset from project-knowledge retrieval."><X size={10} /> EXCLUDE</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.structured.emotionalContext && <div className="rounded border border-sky-500/20 bg-sky-950/20 p-1.5 italic text-sky-400">ℹ {msg.structured.emotionalContext}</div>}
                  <div className="rounded border border-gray-800 bg-[#111726] p-2"><span className="mb-1 block font-bold text-cyan-400">PLAN &amp; EXECUTION:</span><ul className="list-inside list-disc space-y-0.5 text-gray-400">{msg.structured.plan.map((step, idx) => <li key={idx}>{step}</li>)}</ul></div>
                  {msg.structured.suggestedMode && msg.structured.suggestedMode !== 'CHAT' && <div className="flex items-center justify-between rounded border border-cyan-500/30 bg-cyan-950/30 p-2"><span className="text-cyan-300">Suggested Studio: <strong>{msg.structured.suggestedMode}</strong></span><button onClick={() => eventBus.emit('SWITCH_MODE', msg.structured?.suggestedMode)} className="cursor-pointer rounded bg-cyan-500 px-2 py-1 text-[10px] font-bold text-black hover:bg-cyan-400">OPEN {msg.structured.suggestedMode}</button></div>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-2 flex items-center justify-between text-[9px] text-gray-600"><span>Project sources are governed, relevance-selected, and data-only. Quarantined/stale sources retain lower confidence.</span><span>{excludedAssetIds.length ? `${excludedAssetIds.length} project source asset(s) excluded` : 'No source exclusions'}</span></div>
        <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#07090e] p-2 transition focus-within:border-cyan-400">
          <button onClick={toggleSpeechRecognition} className={`cursor-pointer rounded-lg p-2 ${isListening ? 'animate-pulse bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-300'}`}>{isListening ? <Mic size={18} /> : <MicOff size={18} />}</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleSend()} placeholder="Ask MIO, research, inspect a project, or route a creative task..." className="flex-1 bg-transparent px-2 font-mono text-xs text-white outline-none placeholder:text-gray-600" />
          <button onClick={() => setIsSpeaking(!isSpeaking)} className={`cursor-pointer rounded-lg p-2 ${isSpeaking ? 'border border-cyan-500/40 bg-cyan-950 text-cyan-300' : 'text-gray-500 hover:bg-gray-800'}`}><Volume2 size={18} /></button>
          <button onClick={() => void handleSend()} className="cursor-pointer rounded-lg bg-cyan-500 p-2 font-bold text-black shadow-md shadow-cyan-500/20 hover:bg-cyan-400"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};
