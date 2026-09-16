import React from 'react';
import { MioSystemMode } from '../../types/core';
import {
  MessageSquare,
  Globe,
  FolderTree,
  Activity,
  Box,
  Film,
  Palette,
  Brush,
  Image,
  Volume2,
  Music,
  FolderGit2,
  ListTodo,
  Shield,
  Settings,
} from 'lucide-react';

interface ModeNavigationProps {
  activeMode: MioSystemMode;
  onSelectMode: (mode: MioSystemMode) => void;
  mobile?: boolean;
}

interface NavItem {
  mode: MioSystemMode;
  label: string;
  icon: React.ReactNode;
  category: 'Intelligence' | 'Sensory' | 'Creative' | 'System';
}

export const ModeNavigation: React.FC<ModeNavigationProps> = ({ activeMode, onSelectMode, mobile = false }) => {
  const items: NavItem[] = [
    { mode: 'CHAT', label: 'Mio Core', icon: <MessageSquare size={18} />, category: 'Intelligence' },
    { mode: 'RESEARCH', label: 'Research', icon: <Globe size={18} />, category: 'Intelligence' },
    { mode: 'FILES', label: 'File Sandbox', icon: <FolderTree size={18} />, category: 'Intelligence' },
    { mode: 'MOTION', label: 'Motion Tracking', icon: <Activity size={18} />, category: 'Sensory' },
    { mode: '3D', label: '3D Modeling', icon: <Box size={18} />, category: 'Creative' },
    { mode: 'ANIMATION', label: 'Animation', icon: <Film size={18} />, category: 'Creative' },
    { mode: 'GRAPHIC', label: 'Graphic Design', icon: <Palette size={18} />, category: 'Creative' },
    { mode: 'DRAWING', label: 'Drawing Studio', icon: <Brush size={18} />, category: 'Creative' },
    { mode: 'PHOTO', label: 'Photo Editing', icon: <Image size={18} />, category: 'Creative' },
    { mode: 'SFX', label: 'SFX Synthesizer', icon: <Volume2 size={18} />, category: 'Creative' },
    { mode: 'MUSIC', label: 'Music Studio', icon: <Music size={18} />, category: 'Creative' },
    { mode: 'PROJECT', label: 'Project Context', icon: <FolderGit2 size={18} />, category: 'System' },
    { mode: 'TASKS', label: 'Task Monitor', icon: <ListTodo size={18} />, category: 'System' },
    { mode: 'SECURITY', label: 'Security Center', icon: <Shield size={18} />, category: 'System' },
    { mode: 'SETTINGS', label: 'System Settings', icon: <Settings size={18} />, category: 'System' },
  ];

  return (
    <aside
      className={`${mobile ? 'w-[min(19rem,88vw)]' : 'w-56'} h-full bg-[#090d16] border-r border-gray-800 flex flex-col font-mono text-xs select-none`}
      aria-label="MIO workspaces"
    >
      <div className="p-3 text-[10px] text-gray-500 font-bold tracking-wider border-b border-gray-800/80">
        MIO // WORKSPACES
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1 overscroll-contain">
        {items.map((item, idx) => {
          const isSelected = activeMode === item.mode;
          const showCategoryHeader = idx === 0 || items[idx - 1].category !== item.category;

          return (
            <React.Fragment key={item.mode}>
              {showCategoryHeader && (
                <div className="pt-3 pb-1 px-2 text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                  {item.category}
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelectMode(item.mode)}
                className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition cursor-pointer text-left touch-manipulation ${
                  isSelected
                    ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-500/20'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200 active:bg-gray-800'
                }`}
              >
                <span className={isSelected ? 'text-cyan-400' : 'text-gray-500'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-800/80 text-[10px] text-gray-500 text-center">
        COMMAND • CREATE • CONTROL
      </div>
    </aside>
  );
};
