import { validateOrganizationManifest,type OrganizationManifest } from '../file-intelligence/SmartOrganizer';
import { recommendCategoryFolder,recommendProjectGrouping } from '../file-intelligence/OrganizationRecommendations';
import { recommendRename,recommendMove } from '../file-intelligence/RenameMoveRecommendations';
import { recommendDuplicateReview } from '../file-intelligence/DuplicateRecommendations';
import { validateNaturalLanguageOrganizationPlan } from '../file-intelligence/NaturalLanguageOrganizationPlan';
import { previewOrganizationManifest } from '../file-intelligence/OrganizationPreview';
interface SuiteResult{passed:number;total:number}
export async function runSmartOrganizerTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SmartOrganizer test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const folder=recommendCategoryFolder({assetId:'a',kind:'IMAGE'}),group=recommendProjectGrouping({assetId:'a',kind:'IMAGE',project:'Project X'})!;check(folder.execute===false&&group.requiresApproval,'Recommendations cannot execute');
 const rename=recommendRename('a','IMG001.jpg','Project X Cover','jpg'),move=recommendMove('a','Project X/Images','rule:project-image');check(rename.target==='Project X Cover.jpg'&&move.execute===false,'Rename/move remain recommendations');
 const duplicate=recommendDuplicateReview({id:'edge1',from:'a',to:'b',kind:'EXACT_DUPLICATE',directed:false,confidence:1,source:'HASH',evidenceIds:['sha256:x']});check(duplicate.kind==='RECOMMEND_DUPLICATE_REVIEW','Exact duplicate becomes review, not delete');
 const plan=validateNaturalLanguageOrganizationPlan({originalText:'group these by project',allowedActions:['RECOMMEND_GROUP'],scopeAssetIds:['a','b'],plannerSource:'RULES',externalProcessing:false,source:'USER_INSTRUCTION',requiresApproval:true,execute:false});check(plan.execute===false,'Natural-language plan cannot execute');
 const manifest:OrganizationManifest={id:'m1',recommendations:[rename,{...rename,id:'rename:b',assetIds:['b']}],generatedBy:'mio-smart-organizer-v1',mutationAllowed:false};validateOrganizationManifest(manifest);const preview=previewOrganizationManifest(manifest);check(!preview.readyForApproval&&preview.conflicts.some(c=>c.kind==='TARGET_COLLISION'),'Preview blocks rename target collision');
 return {passed,total};
}
