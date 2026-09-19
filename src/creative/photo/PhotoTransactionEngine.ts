import type { CreativeCommandEnvelope, CreativeDocument } from '../../types/creativeDocument';
import { CreativeDocumentKernel } from '../CreativeDocumentKernel';
import { compilePhotoCommand, type PhotoCommand } from './PhotoDocumentAdapter';

export type PhotoOperationSource='manual'|'ai'|'automation';
export interface PhotoTransactionMetadata {label:string;source:PhotoOperationSource;toolId?:string;affectedNodeIds?:string[];renderHints?:('composite'|'geometry'|'mask'|'pixels'|'color')[];}
export interface PhotoTransaction {id:string;commands:PhotoCommand[];metadata:PhotoTransactionMetadata;timestamp?:number;}

export const compilePhotoTransaction=(document:CreativeDocument,transaction:PhotoTransaction):CreativeCommandEnvelope=>{
 if(document.kind!=='photo')throw new Error('Photo transactions require a photo document.');
 let working=structuredClone(document);
 const commands=transaction.commands.map(command=>{
  const compiled=compilePhotoCommand(working,command);
  const sandbox=new CreativeDocumentKernel(working);
  working=sandbox.execute({actor:transaction.metadata.source==='manual'?'user':'agent',command:compiled});
  return compiled;
 });
 return {id:transaction.id,timestamp:transaction.timestamp,actor:transaction.metadata.source==='manual'?'user':'agent',command:{type:'batch',commands}};
};

export class PhotoTransactionEngine {
 public constructor(private readonly kernel:CreativeDocumentKernel){}
 public execute(transaction:PhotoTransaction):CreativeDocument{
  const envelope=compilePhotoTransaction(this.kernel.snapshot(),transaction);
  return this.kernel.execute(envelope);
 }
 public snapshot():CreativeDocument{return this.kernel.snapshot();}
 public undo():CreativeDocument{return this.kernel.undo();}
 public redo():CreativeDocument{return this.kernel.redo();}
}
