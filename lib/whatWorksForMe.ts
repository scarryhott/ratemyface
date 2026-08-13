export type Evidence={source:'profile'|'interaction'|'recommendation';label:string;detail:string;feedback?:string|null};

function asText(v:unknown):string{
 if(typeof v==='string')return v.trim();
 if(typeof v==='number'||typeof v==='boolean')return String(v);
 if(Array.isArray(v))return v.map(asText).filter(Boolean).join(', ');
 return '';
}

function profileEvidence(p:Record<string,unknown>,prefix=''):Evidence[]{
 const out:Evidence[]=[];
 for(const [k,v] of Object.entries(p||{})){
  const label=prefix?`${prefix}.${k}`:k;
  if(v&&typeof v==='object'&&!Array.isArray(v))out.push(...profileEvidence(v as Record<string,unknown>,label));
  else {const detail=asText(v);if(detail)out.push({source:'profile',label,detail});}
 }
 return out;
}

function sentiment(f?:string|null){
 const s=String(f||'').toLowerCase();
 if(/worked|helpful|useful|good|liked|love|better|success/.test(s))return 1;
 if(/wrong|bad|dislike|not useful|didn't|did not|worse/.test(s))return -1;
 return 0;
}

export function synthesizeWhatWorksForMe(input:{profile?:Record<string,unknown>|null;history?:any[];recommendations?:any[]}){
 const prefs=profileEvidence(input.profile||{});
 const interactions=(input.history||[]).filter(x=>String(x?.summary||'').trim()).slice(0,20).map(x=>({source:'interaction' as const,label:String(x.kind||'interaction'),detail:String(x.summary).trim()}));
 const recs=(input.recommendations||[]).filter(x=>x?.title||x?.feedback).slice(0,20).map(x=>({source:'recommendation' as const,label:String(x.item_type||'recommendation'),detail:String(x.title||'Recommendation'),feedback:x.feedback||null}));
 const positive=recs.filter(x=>sentiment(x.feedback)>0);
 const negative=recs.filter(x=>sentiment(x.feedback)<0);
 const n=prefs.length+interactions.length+recs.length;
 return {
  title:'What Works For Me',
  summary:n?`Rate My Face has ${n} saved evidence points available for this personal synthesis.`:'There is not enough saved evidence yet.',
  learned_preferences:prefs.slice(0,12),
  positive_outcomes:positive,
  negative_outcomes:negative,
  recent_evidence:interactions.slice(0,8),
  evidence_count:n,
  confidence:n>=12?'growing':n>=4?'early':'insufficient',
  next_step:positive.length+negative.length?'Use demonstrated positive and negative outcomes to guide the next recommendation or comparison.':'Give recommendation feedback or complete a Compare Me To Me check to distinguish stated preferences from demonstrated outcomes.'
 };
}
