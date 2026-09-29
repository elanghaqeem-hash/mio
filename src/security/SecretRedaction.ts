const SECRET_KEY=/\b(api[-_]?key|authorization|token|secret|password|credential)\b/i;
const BEARER=/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
export function redactSensitiveValue(value:unknown):unknown{
 if(typeof value==='string')return value.replace(BEARER,'Bearer [REDACTED]');
 if(Array.isArray(value))return value.map(redactSensitiveValue);
 if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [k,v] of Object.entries(value as Record<string,unknown>))out[k]=SECRET_KEY.test(k)?'[REDACTED]':redactSensitiveValue(v);return out;}return value;
}
export function assertNoSecretFields(value:unknown):void{if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value as Record<string,unknown>)){if(SECRET_KEY.test(k))throw new Error('Secret-bearing fields are not allowed in provenance or audit payloads');assertNoSecretFields(v);}}}