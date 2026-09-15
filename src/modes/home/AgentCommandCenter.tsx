import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Command, FolderGit2, Radio, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';
import { eventBus } from '../../core/EventBus';
import { ProjectManager } from '../../project/ProjectManager';
import { systemPreferences } from '../../settings/SystemPreferences';
import { MioCoreState, MioSystemMode } from '../../types/core';
import { ChatStudioView } from '../chat/ChatStudioView';
import { MissionPulse } from './MissionPulse';

interface AgentCommandCenterProps {
  coreState: MioCoreState;
  onSelectMode: (mode: MioSystemMode) => void;
}

const stateCopy: Record<MioCoreState, { eyebrow: string; title: string; detail: string }> = {
  IDLE: { eyebrow: 'MIO CORE READY', title: 'Apa yang ingin kita kerjakan?', detail: 'Berikan tujuan. Mio akan menyusun konteks, rencana, dan langkah yang dapat Anda kendalikan.' },
  LISTENING: { eyebrow: 'VOICE CHANNEL ACTIVE', title: 'Saya mendengarkan', detail: 'Ucapkan tujuan, batasan, dan hasil yang Anda inginkan.' },
  THINKING: { eyebrow: 'UNDERSTANDING REQUEST', title: 'Memahami konteks', detail: 'Mio sedang menghubungkan tujuan dengan konteks proyek yang diizinkan.' },
  PROCESSING: { eyebrow: 'PLAN IN PROGRESS', title: 'Menyusun rencana', detail: 'Langkah dan sumber daya sedang disiapkan sebelum tindakan dijalankan.' },
  EXECUTING: { eyebrow: 'MISSION ACTIVE', title: 'Menjalankan tugas', detail: 'Kemajuan dan tindakan dapat dipantau melalui panel aktivitas.' },
  ONLINE: { eyebrow: 'NETWORK ROUTE ACTIVE', title: 'Mode online tersedia', detail: 'Permintaan jaringan tetap mengikuti provider dan batas izin aktif.' },
  OFFLINE: { eyebrow: 'LOCAL BOUNDARY ACTIVE', title: 'Bekerja secara lokal', detail: 'Tidak ada koneksi internet yang digunakan pada mode ini.' },
  CREATIVE: { eyebrow: 'CREATIVE ORCHESTRATOR', title: 'Ruang kreatif siap', detail: 'Pilih studio; Mio akan menjadi copilot tanpa mengambil alih canvas.' },
  CREATING: { eyebrow: 'CREATIVE TASK ACTIVE', title: 'Membentuk hasil', detail: 'Perubahan kreatif diproses secara terukur dan dapat ditinjau.' },
  WAITING_PERMISSION: { eyebrow: 'APPROVAL REQUIRED', title: 'Menunggu keputusan Anda', detail: 'Tinjau target, dampak, cakupan, dan masa berlaku izin.' },
  '3D MODE': { eyebrow: '3D STUDIO', title: 'Copilot 3D aktif', detail: 'Viewport dan alat pemodelan tetap menjadi ruang kerja utama.' },
  'ANIMATION MODE': { eyebrow: 'ANIMATION STUDIO', title: 'Copilot animasi aktif', detail: 'Timeline dan keyframe tetap berada di bawah kendali Anda.' },
  'GRAPHIC MODE': { eyebrow: 'DESIGN STUDIO', title: 'Copilot desain aktif', detail: 'Layer, frame, dan aset tetap dapat diedit secara nondestruktif.' },
  'DRAWING MODE': { eyebrow: 'DRAWING STUDIO', title: 'Copilot gambar aktif', detail: 'Brush, stroke, dan layer tetap berada di dokumen lokal yang dapat dibatalkan.' },
  'SFX MODE': { eyebrow: 'SFX STUDIO', title: 'Copilot audio aktif', detail: 'Waveform, routing, dan efek tetap menjadi pusat pekerjaan.' },
  'MUSIC MODE': { eyebrow: 'MUSIC STUDIO', title: 'Copilot musik aktif', detail: 'Track, mixer, dan arrangement tetap menjadi ruang kerja utama.' },
  SECURITY: { eyebrow: 'SECURITY BOUNDARY', title: 'Kontrol keamanan aktif', detail: 'Izin dan batas eksekusi diterapkan pada seluruh tindakan.' },
  WARNING: { eyebrow: 'ATTENTION REQUIRED', title: 'Ada hal yang perlu ditinjau', detail: 'Buka detail sebelum melanjutkan tindakan.' },
  ERROR: { eyebrow: 'MISSION INTERRUPTED', title: 'Tugas belum dapat diselesaikan', detail: 'Periksa penyebab, lalu coba kembali atau ubah rute.' },
  SUCCESS: { eyebrow: 'MISSION COMPLETE', title: 'Tugas selesai', detail: 'Hasil siap ditinjau, disimpan, atau diteruskan ke langkah berikutnya.' },
  'EMOTIONAL SUPPORT': { eyebrow: 'SUPPORT MODE', title: 'Saya hadir bersama Anda', detail: 'Kita dapat memperlambat langkah dan menentukan prioritas yang paling membantu.' },
};

const quickCommands = [
  { label: 'Susun rencana kerja', prompt: 'Bantu saya menyusun rencana kerja yang terstruktur untuk tujuan berikut: ' },
  { label: 'Analisis proyek aktif', prompt: 'Analisis kondisi proyek aktif, temukan risiko dan prioritas berikutnya.' },
  { label: 'Buat aset kreatif', prompt: 'Bantu saya menentukan studio dan alur terbaik untuk membuat aset kreatif berikut: ' },
];

export const AgentCommandCenter: React.FC<AgentCommandCenterProps> = ({ coreState, onSelectMode }) => {
  const [preferences, setPreferences] = useState(() => systemPreferences.getSnapshot());
  const project = ProjectManager.getProject();
  const copy = stateCopy[coreState] ?? stateCopy.IDLE;

  useEffect(() => systemPreferences.subscribe(setPreferences), []);

  const providerLabel = useMemo(() => {
    const provider = preferences.modelRouter.provider;
    return provider === 'local_heuristic' ? 'Mio Local' : provider === 'openrouter' ? 'OpenRouter' : provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : provider === 'claude' ? 'Claude' : 'Ollama';
  }, [preferences.modelRouter.provider]);

  const setDraft = (prompt: string) => {
    eventBus.emit('CHAT_DRAFT', prompt);
    document.getElementById('mio-conversation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="agent-command-center h-full overflow-y-auto bg-[#05070b]">
      <section className="agent-hero cyber-grid relative isolate min-h-[430px] overflow-hidden border-b border-cyan-950/70 px-4 py-7 sm:px-8 lg:min-h-[470px] lg:px-10">
        <div className="agent-hero-glow" aria-hidden="true" />
        <div className="hud-corner hud-corner-tl" aria-hidden="true" />
        <div className="hud-corner hud-corner-tr" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid h-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.1fr)]">
          <div className="order-2 lg:order-1">
            <div className="mb-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              <span className="agent-status-chip"><Radio size={11} /> {preferences.networkState}</span>
              <span className="agent-status-chip"><ShieldCheck size={11} /> {preferences.autonomyLevel}</span>
              <span className="agent-status-chip"><Command size={11} /> {providerLabel}</span>
            </div>
            <p className="mb-3 font-mono text-[11px] font-bold tracking-[0.28em] text-cyan-300">{copy.eyebrow}</p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">{copy.detail}</p>

            <div className="mt-7 grid gap-2 sm:grid-cols-3">
              {quickCommands.map((command) => (
                <button key={command.label} type="button" onClick={() => setDraft(command.prompt)} className="agent-quick-command group">
                  <Sparkles size={15} className="text-cyan-300" />
                  <span>{command.label}</span>
                  <ArrowRight size={14} className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><FolderGit2 size={12} /> {project.name}</span>
              <span>{project.assets.length} ASSETS</span>
              <button type="button" onClick={() => onSelectMode('TASKS')} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">OPEN MISSION CONTROL <ArrowRight size={11} /></button>
            </div>
          </div>

          <div className="order-1 flex min-h-[240px] items-center justify-center lg:order-2 lg:min-h-[390px]">
            <div className="agent-orb-stage" aria-live="polite" aria-label={`${copy.eyebrow}. ${copy.title}`}>
              <div className="agent-orbit agent-orbit-one" aria-hidden="true" />
              <div className="agent-orbit agent-orbit-two" aria-hidden="true" />
              <MioCoreVisualizer state={coreState} size={300} interactive={false} priority="hero" />
              <div className="agent-orb-caption"><WandSparkles size={12} /> MIO COGNITIVE CORE</div>
            </div>
          </div>
        </div>
      </section>

      <MissionPulse onSelectMode={onSelectMode} />

      <section id="mio-conversation" className="mx-auto min-h-[560px] max-w-6xl border-x border-gray-900/80 bg-[#070a10]">
        <ChatStudioView />
      </section>
    </div>
  );
};
