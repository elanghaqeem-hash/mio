export interface MioVoiceRateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export function mioVoiceRateLimitRequired(value:string|undefined):boolean {
  return value?.trim().toLowerCase()==='true';
}

export async function enforceMioVoiceRateLimit(
  binding:MioVoiceRateLimitBinding|undefined,
  required:boolean,
  key:string,
):Promise<'allowed'|'limited'|'unavailable'> {
  if (!binding) return required ? 'unavailable' : 'allowed';
  try {
    const result=await binding.limit({key});
    return result.success ? 'allowed' : 'limited';
  } catch {
    return required ? 'unavailable' : 'allowed';
  }
}
