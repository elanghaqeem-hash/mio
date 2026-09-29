export interface AIBudgetSnapshot{limitUsd:number;reservedUsd:number;spentUsd:number;remainingUsd:number;}
export class AICostLedger{private reserved=0;private spent=0;constructor(private readonly limitUsd:number){if(!Number.isFinite(limitUsd)||limitUsd<0)throw new Error('AI budget must be non-negative');}
 snapshot():AIBudgetSnapshot{return {limitUsd:this.limitUsd,reservedUsd:this.reserved,spentUsd:this.spent,remainingUsd:Math.max(0,this.limitUsd-this.reserved-this.spent)};}
 reserve(estimatedUsd:number){if(!Number.isFinite(estimatedUsd)||estimatedUsd<0)throw new Error('Invalid AI cost reservation');if(estimatedUsd>this.snapshot().remainingUsd)throw new Error('AI cost budget exhausted');this.reserved+=estimatedUsd;}
 settle(estimatedUsd:number,actualUsd:number){if(actualUsd<0||!Number.isFinite(actualUsd))throw new Error('Invalid actual AI cost');this.reserved=Math.max(0,this.reserved-estimatedUsd);if(this.spent+actualUsd>this.limitUsd)throw new Error('Actual AI cost exceeds configured budget');this.spent+=actualUsd;}
 release(estimatedUsd:number){this.reserved=Math.max(0,this.reserved-estimatedUsd);}
}