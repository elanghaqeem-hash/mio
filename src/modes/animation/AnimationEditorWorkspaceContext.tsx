import React,{createContext,useContext,useMemo,useState}from'react';
import type{MioAnimationProject}from'../../types/creative';
import{DEFAULT_ANIMATION_EDITOR_STATE,reconcileAnimationEditorState,type AnimationEditorState}from'./AnimationEditorState';

type EditorUpdater=(state:AnimationEditorState)=>AnimationEditorState;
interface AnimationEditorWorkspaceValue{editor:AnimationEditorState;setEditor:React.Dispatch<React.SetStateAction<AnimationEditorState>>;updateEditor:(updater:EditorUpdater)=>void}
const AnimationEditorWorkspaceContext=createContext<AnimationEditorWorkspaceValue|null>(null);
const validSelections=(project:MioAnimationProject)=>(project.rigs??[]).flatMap(r=>r.bones.map(b=>({rigId:r.id,boneId:b.id})));

export const AnimationEditorWorkspaceProvider:React.FC<{project:MioAnimationProject;children:React.ReactNode}>=({project,children})=>{
 const[rawEditor,setRawEditor]=useState<AnimationEditorState>(()=>({...DEFAULT_ANIMATION_EDITOR_STATE,time:Number.isFinite(project.currentTime)?project.currentTime:0}));
 const editor=useMemo(()=>reconcileAnimationEditorState(rawEditor,validSelections(project),project.duration),[rawEditor,project]);
 const setEditor:React.Dispatch<React.SetStateAction<AnimationEditorState>>=next=>setRawEditor(prev=>typeof next==='function'?(next as EditorUpdater)(reconcileAnimationEditorState(prev,validSelections(project),project.duration)):next);
 const updateEditor=(updater:EditorUpdater)=>setEditor(updater);
 const value=useMemo(()=>({editor,setEditor,updateEditor}),[editor]);
 return <AnimationEditorWorkspaceContext.Provider value={value}>{children}</AnimationEditorWorkspaceContext.Provider>;
};

export const useAnimationEditorWorkspace=()=>{const value=useContext(AnimationEditorWorkspaceContext);if(!value)throw new Error('useAnimationEditorWorkspace must be used inside AnimationEditorWorkspaceProvider');return value};
