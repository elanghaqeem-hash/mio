import type{MioAnimationProject}from'../../types/creative';
export const normalizeAnimationTime=(project:MioAnimationProject,time:number):number=>{if(!Number.isFinite(time))return 0;return Math.max(0,Math.min(project.duration,time))};
export const synchronizeProjectTime=(project:MioAnimationProject,time:number):MioAnimationProject=>{const currentTime=normalizeAnimationTime(project,time);return project.currentTime===currentTime?project:{...project,currentTime}};
