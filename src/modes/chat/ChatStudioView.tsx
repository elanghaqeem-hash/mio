import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CircleOff, Database, Download, Mic, MicOff, RefreshCw, Send, ShieldCheck, Volume2, WifiOff, X } from 'lucide-react';
import { AgentOrchestrator, StructuredAgentResponse } from '../../agents/AgentOrchestrator';
import { ModelRouter } from '../../agents/ModelRouter';
import { eventBus } from '../../core/EventBus';
import { EvidencePackageBuilder, type MioEvidencePackage } from '../../project/EvidencePackage';
import { ProjectKnowledgeIndex } from '../../project/ProjectKnowledgeIndex';
import { ProjectManager } from '../../project/ProjectManager';
import { systemPreferences } from '../../settings/SystemPreferences';
import { MioCoreState } from '../../types/core';
import { ModelMessage, ProviderReadiness } from '../../types/models';
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
  const [messages, setMessages] = useState<Message[]>([{ id: 'msg_init', sender: 'mio', text: 'MIO Web Lab is active. Local-first intelligence, governed memory, controlled research, project context, secure tools, and model routing are available according to the current Technology Preview configuration.', timestamp: INITIAL_MESSAGE_TIME }]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [projectKnowledgeEnabled, setProjectKnowledgeEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [excludedAssetIds, setExcludedAssetIds] = useState<string[]>(persistentExclusions);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadiness | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef(`chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  useEffect(() => eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state)), []);
  useEffect(() => eventBus.on('CHAT_DRAFT', (draft: string) => setInput(draft)), []);
  useEffect(() => eventBus.on('PROJECT_UPDATED', () => setExcludedAssetIds(persistentExclusions())), []);
  useEffect(() => {
    let active = true;
    let checkSequence = 0;
    const checkProvider = async () => {
      const sequence = ++checkSequence;
      setCheckingProvider(true);
      const result = await ModelRouter.checkProviderReadiness();
      if (active && sequence === checkSequence) {
        setProviderReadiness(result);
        setCheckingProvider(false);
      }
    };
    void checkProvider();
    const unsubscribe = systemPreferences.subscribe(() => void checkProvider());
    return () => { active = false; unsubscribe(); };
  }, []);

  const providerReady = providerReadiness?.ready === true && !checkingProvider;

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
    if (!userText || !providerReady) return;
    const conversation = buildConversationContext();
    const exclusionsAtRequest = [...excludedAssetIds];
    const projectKnowledgeAtRequest = projectKnowledgeEnabled;
    const memoryAtRequest = memoryEnabled;
    setInput('');
    setMessages((prev) => [...prev, { id: `msg_user_${Date.now()}`, sender: 'user', text: userText, timestamp: Date.now() }]);

    const structured = await AgentOrchestrator.processPrompt(userText, conversation, {
      projectKnowledgeEnabled: projectKnowledgeAtRequest,
      memoryEnabled: memoryAtRequest,
      excludedAssetIds: exclusionsAtRequest,
      contextBudgetChars: 4800,
      memoryContextBudgetChars: 3600,
      sessionId: sessionIdRef.current,
    });
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
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#07090e] font-mono text-xs">
      <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-gray-800 bg-[#0b1018] px-3 py-2 text-[10px] sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-gray-500 sm:gap-3">
          <span className="hidden whitespace-nowrap md:inline">DIRECT CONTEXT // LAST 12 MESSAGES MAX</span>
          <button type="button" onClick={() => setMemoryEnabled((current) => !current)} className={`flex min-h-9 shrink-0 items-center gap-1 rounded border px-2 py-1 touch-manipulation ${memoryEnabled ? 'border-violet-500/40 bg-violet-950/30 text-violet-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`} title="Governed memory is session/project scoped, bounded, and always treated as contextual data rather than instruction authority.">
            {memoryEnabled ? <Database size={11} /> : <CircleOff size={11} />} MEMORY {memoryEnabled ? 'ON' : 'OFF'}
          </button>
          <button type="button" onClick={() => setProjectKnowledgeEnabled((current) => !current)} className={`flex min-h-9 shrink-0 items-center gap-1 rounded border px-2 py-1 touch-manipulation ${projectKnowledgeEnabled ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`} title="Project knowledge is retrieved only when relevant and remains application data, not instruction authority.">
            {projectKnowledgeEnabled ? <BookOpen size={11} /> : <CircleOff size={11} />} PROJECT KNOWLEDGE {projectKnowledgeEnabled ? 'ON' : 'OFF'}
          </button>
          {excludedAssetIds.length > 0 && <button type="button" onClick={resetExclusions} className="min-h-9 shrink-0 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-amber-300 touch-manipulation">{excludedAssetIds.length} EXCLUDED · RESET</button>}
        </div>
        <span className="font-bold text-cyan-400">CORE: {coreState}</span>
      </div>

      <div ref={messagesContainerRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] text-gray-500">{msg.sender === 'user' ? 'USER' : 'MIO CORE'} // {new Date(msg.timestamp).toLocaleTimeString()}</span>
              {msg.sender === 'mio' && <span className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] text-emerald-400"><ShieldCheck size={10} /> VALIDATED</span>}
            </div>

            <div className={`w-fit max-w-[94%] rounded-xl p-3 leading-relaxed break-words sm:max-w-2xl sm:p-4 ${msg.sender === 'user' ? 'border border-cyan-500/40 bg-cyan-950/50 text-cyan-200' : 'border border-gray-800 bg-[#0d121d] text-gray-200'}`}>
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              {msg.structured && (
                <div className="mt-3 space-y-2 border-t border-gray-800 pt-3 text-[11px]">
                  {msg.structured.modelProvider && <div className="flex flex-wrap gap-2 text-[9px]"><span className="rounded border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5 text-cyan-300">PROVIDER: {msg.structured.modelProvider}</span><span className="rounded border border-violet-500/30 bg-violet-950/30 px-2 py-0.5 text-violet-300">MODEL: {msg.structured.modelName}</span><span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-300">SOURCE: {msg.structured.modelSource}</span>{msg.structured.webSearchUsed !== undefined && <span className={`rounded border px-2 py-0.5 ${msg.structured.webSearchUsed ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>WEB SEARCH: {msg.structured.webSearchUsed ? 'USED' : 'NOT USED'}</span>}</div>}

                  {msg.structured.citations && msg.structured.citations.length > 0 && <div className="rounded border border-emerald-500/20 bg-emerald-950/10 p-2"><div className="mb-1 font-bold text-emerald-300">WEB SOURCES</div><div className="space-y-1">{msg.structured.citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="block truncate text-[9px] text-cyan-300 underline decoration-cyan-500/40 hover:text-cyan-200">{citation.title || citation.url}</a>)}</div></div>}

                  {(msg.structured.memoryContextEnabled !== undefined || msg.structured.projectContextEnabled !== undefined) && <div className="flex flex-wrap items-center gap-2 text-[9px]">
                    {msg.structured.memoryContextEnabled !== undefined && <><span className={`rounded border px-2 py-0.5 ${msg.structured.memoryContextEnabled ? 'border-violet-500/30 bg-violet-950/20 text-violet-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>MEMORY: {msg.structured.memoryContextEnabled ? 'ENABLED' : 'DISABLED'}</span><span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-400">MEMORY SOURCES: {msg.structured.memoryContextSources ?? 0}</span></>}
                    {msg.structured.projectContextEnabled !== undefined && <><span className={`rounded border px-2 py-0.5 ${msg.structured.projectContextEnabled ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>PROJECT CONTEXT: {msg.structured.projectContextEnabled ? 'ENABLED' : 'DISABLED'}</span><span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-400">PROJECT SOURCES: {msg.structured.projectContextSources ?? 0}</span></>}
                  </div>}

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

      <div className="shrink-0 border-t border-gray-800 bg-[#0d121d] p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-4">
        {!providerReady && (
          <div className="mb-3 flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-[10px] text-amber-200 sm:flex-row">
            <div className="flex min-w-0 items-start gap-2"><WifiOff size={14} className="mt-0.5 shrink-0" /><div><div className="font-bold">AI PROVIDER NOT READY — CHAT SEND DISABLED</div><div className="mt-1 break-words text-amber-300/80">{checkingProvider ? 'Checking the selected provider without sending chat content…' : providerReadiness?.detail ?? 'Provider readiness has not been verified.'}</div></div></div>
            <button onClick={() => eventBus.emit('SWITCH_MODE', 'SETTINGS')} className="shrink-0 rounded border border-amber-500/40 px-2 py-1 font-bold hover:bg-amber-950/40">OPEN SETTINGS</button>
          </div>
        )}
        {providerReady && providerReadiness && <div className="mb-2 flex items-center gap-1.5 text-[9px] text-emerald-400"><RefreshCw size={10} /> PROVIDER READY: {providerReadiness.provider.toUpperCase()}</div>}
        <div className="mb-2 hidden items-center justify-between text-[9px] text-gray-600 sm:flex"><span>Memory and project sources are bounded, scoped, governed, and data-only; neither can grant authorization.</span><span>{excludedAssetIds.length ? `${excludedAssetIds.length} project source asset(s) excluded` : 'No project source exclusions'}</span></div>
        <div className="flex items-end gap-1.5 rounded-xl border border-gray-700 bg-[#07090e] p-1.5 transition focus-within:border-cyan-400 sm:gap-2 sm:p-2">
          <button type="button" onClick={toggleSpeechRecognition} className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg touch-manipulation ${isListening ? 'animate-pulse bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-300'}`}>{isListening ? <Mic size={18} /> : <MicOff size={18} />}</button>
          <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && providerReady) { e.preventDefault(); void handleSend(); } }} placeholder={providerReady ? 'Ask MIO, research, inspect a project, or route a creative task...' : 'Configure and verify an AI provider in System Settings first'} className="max-h-28 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 font-mono text-base leading-5 text-white outline-none placeholder:text-gray-600 sm:py-2 sm:text-xs" />
          <button type="button" onClick={() => setIsSpeaking(!isSpeaking)} className={`hidden h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg touch-manipulation sm:inline-flex ${isSpeaking ? 'border border-cyan-500/40 bg-cyan-950 text-cyan-300' : 'text-gray-500 hover:bg-gray-800'}`}><Volume2 size={18} /></button>
          <button type="button" onClick={() => void handleSend()} disabled={!providerReady || !input.trim()} className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-cyan-500 font-bold text-black shadow-md shadow-cyan-500/20 touch-manipulation hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};
