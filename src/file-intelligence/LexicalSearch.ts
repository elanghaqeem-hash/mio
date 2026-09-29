import type { SmartSearchEvidence,SmartSearchResult } from './SmartSearch';
export interface LexicalSearchDocument{assetId:string;filename:string;metadata:Record<string,string|number|boolean|null|undefined>;text?:string;}
const norm=(s:string)=>s.normalize('NFKC').toLocaleLowerCase();
function evidence(mode:SmartSearchEvidence['mode'],locator:string,snippet:string):SmartSearchEvidence{return {mode,locator,snippet:snippet.slice(0,240),source:'LOCAL_INDEX'};}
export function lexicalSearch(docs:readonly LexicalSearchDocument[],query:string,modes:readonly ('FILENAME'|'METADATA'|'FULL_TEXT')[],limit=50):SmartSearchResult[]{
 const q=norm(query.trim());if(!q)return [];const out:SmartSearchResult[]=[];
 for(const d of docs){const ev:SmartSearchEvidence[]=[];let score=0;if(modes.includes('FILENAME')&&norm(d.filename).includes(q)){score+=1;ev.push(evidence('FILENAME','filename',d.filename));}
 if(modes.includes('METADATA'))for(const [k,v] of Object.entries(d.metadata)){if(v!=null&&norm(String(v)).includes(q)){score+=.6;ev.push(evidence('METADATA',`metadata.${k}`,String(v)));break;}}
 if(modes.includes('FULL_TEXT')&&d.text){const t=norm(d.text),i=t.indexOf(q);if(i>=0){score+=.8;ev.push(evidence('FULL_TEXT',`text:${i}`,d.text.slice(Math.max(0,i-80),i+q.length+80)));}}
 if(ev.length)out.push({assetId:d.assetId,score:Math.min(1,score/2.4),evidence:ev});}
 return out.sort((a,b)=>b.score-a.score||a.assetId.localeCompare(b.assetId)).slice(0,Math.min(500,Math.max(1,limit)));
}
