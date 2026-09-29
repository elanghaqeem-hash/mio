import { previewMutationTransaction } from '../file-intelligence/MutationPreview';
import { createMutationApproval,assertApprovalMatchesPreview } from '../file-intelligence/MutationApproval';
import { executeApprovedMutation } from '../file-intelligence/MutationExecution';
import type { MutationTransaction } from '../file-intelligence/SafeMutation';
interface SuiteResult{passed:number;total:number}
export async function runSafeMutationTests():Promise<SuiteResult>{let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SafeMutation test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const tx:MutationTransaction={id:'tx1',workspaceId:'ws_test',state:'PROPOSED',operations:[{id:'op1',kind:'MOVE',source:'a.txt',target:'archive/a.txt',collisionPolicy:'BLOCK'}]};
 const preview=previewMutationTransaction(tx);check(preview.readyForApproval,'Safe relative move is approval-ready');
 const approval=createMutationApproval(preview,'0123456789abcdef','2026-09-29T00:00:00.000Z');assertApprovalMatchesPreview(approval,preview,'0123456789abcdef');check(true,'Exact preview approval validates');
 let rejected=false;try{assertApprovalMatchesPreview({...approval,previewDigest:'fnv1a32:deadbeef'},preview,'0123456789abcdef')}catch{rejected=true}check(rejected,'Tampered approval is rejected');
 const unsafe=previewMutationTransaction({...tx,id:'tx2',operations:[{id:'op2',kind:'MOVE',source:'../escape.txt',target:'safe.txt',collisionPolicy:'BLOCK'}]});check(!unsafe.readyForApproval&&unsafe.entries[0].reasons.includes('UNSAFE_SOURCE_PATH'),'Traversal blocks approval');
 const collision=previewMutationTransaction({...tx,id:'tx3',operations:[{id:'a',kind:'COPY',source:'a.txt',target:'same.txt',collisionPolicy:'BLOCK'},{id:'b',kind:'COPY',source:'b.txt',target:'same.txt',collisionPolicy:'BLOCK'}]});check(!collision.readyForApproval&&collision.entries.every(e=>e.reasons.includes('TARGET_COLLISION_IN_MANIFEST')),'Manifest target collision blocks approval');
 const calls:string[]=[];const receipt=await executeApprovedMutation(tx,preview,approval,'0123456789abcdef',{mutate:async(_w,o)=>{calls.push(o.id);throw new Error('simulated failure')}});check(receipt.state==='FAILED'&&receipt.failedOperationId==='op1'&&calls.length===1,'Execution fails closed with explicit receipt');
 check(!tx.operations.some(o=>(o.kind as string)==='DELETE'),'Permanent delete operation does not exist');
 return {passed,total};}
