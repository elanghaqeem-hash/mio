// MIO-PRV-06.02: keys are matched on their word parts, so camelCase and SCREAMING_CASE names
// (accessToken, clientSecret, OPENAI_API_KEY) are caught as well as snake/kebab case.
const SECRET_KEY_WORDS=/(^|_)(api_?keys?|authorization|token|secret|password|passwd|credentials?|private_?key|cookie)(_|$)/;
const keyWords=(key:string)=>key.replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[^A-Za-z0-9]+/g,'_').toLowerCase();
export const isSecretKey=(key:string):boolean=>SECRET_KEY_WORDS.test(keyWords(key));
// Keep in sync with SECRET_VALUE_PATTERNS in functions/api/_security.ts (a regression test compares them).
export const SECRET_VALUE_PATTERNS:readonly RegExp[]=[
 /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
 /\b(x-api-key|x-goog-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
 /\bsk-[A-Za-z0-9_-]{16,}/g,
 /\bAIza[0-9A-Za-z_-]{20,}/g,
 /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];
export function redactSecretText(text:string):string{
 return SECRET_VALUE_PATTERNS.reduce((current,pattern)=>current.replace(pattern,(match,name?:string,separator?:string)=>(
  typeof name==='string'&&typeof separator==='string'?`${name}${separator}[REDACTED]`:/^bearer/i.test(match)?'Bearer [REDACTED]':'[REDACTED]'
 )),text);
}
export function redactSensitiveValue(value:unknown):unknown{
 if(typeof value==='string')return redactSecretText(value);
 if(Array.isArray(value))return value.map(redactSensitiveValue);
 if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [k,v] of Object.entries(value as Record<string,unknown>))out[k]=isSecretKey(k)?'[REDACTED]':redactSensitiveValue(v);return out;}return value;
}
export function assertNoSecretFields(value:unknown):void{if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value as Record<string,unknown>)){if(isSecretKey(k))throw new Error('Secret-bearing fields are not allowed in provenance or audit payloads');assertNoSecretFields(v);}}}
