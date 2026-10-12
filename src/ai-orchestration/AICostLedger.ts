export interface AIBudgetSnapshot{limitUsd:number;reservedUsd:number;spentUsd:number;remainingUsd:number;}
export class AICostLedger{private reserved=0;private spent:number;constructor(private readonly limitUsd:number,initialSpentUsd=0){if(!Number.isFinite(limitUsd)||limitUsd<0)throw new Error('AI budget must be non-negative');if(!Number.isFinite(initialSpentUsd)||initialSpentUsd<0)throw new Error('Initial AI spend must be non-negative');this.spent=initialSpentUsd;}
 snapshot():AIBudgetSnapshot{return {limitUsd:this.limitUsd,reservedUsd:this.reserved,spentUsd:this.spent,remainingUsd:Math.max(0,this.limitUsd-this.reserved-this.spent)};}
 reserve(estimatedUsd:number){if(!Number.isFinite(estimatedUsd)||estimatedUsd<0)throw new Error('Invalid AI cost reservation');if(estimatedUsd>this.snapshot().remainingUsd)throw new Error('AI cost budget exhausted');this.reserved+=estimatedUsd;}
 // Money already spent is always recorded, even past the limit; the overshoot is reported, not lost.
 settle(estimatedUsd:number,actualUsd:number):{exceededLimit:boolean}{if(actualUsd<0||!Number.isFinite(actualUsd))throw new Error('Invalid actual AI cost');this.reserved=Math.max(0,this.reserved-estimatedUsd);this.spent+=actualUsd;return {exceededLimit:this.spent>this.limitUsd};}
 release(estimatedUsd:number){this.reserved=Math.max(0,this.reserved-estimatedUsd);}
}