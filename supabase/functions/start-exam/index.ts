import { authenticatedUser, handleOptions, json, shuffle } from '../_shared/common.ts'
const EXAM_MINUTES=75
const COOLDOWN_HOURS=24
const DOMAIN_DIFFICULTY:Record<string,{medium:number,hard:number,very_hard:number}>={
  products:{medium:2,hard:6,very_hard:4},
  network:{medium:1,hard:5,very_hard:4},
  appliances:{medium:1,hard:6,very_hard:3},
  setup:{medium:2,hard:5,very_hard:1},
  security:{medium:1,hard:4,very_hard:3},
  automation:{medium:1,hard:4,very_hard:1},
  troubleshooting:{medium:1,hard:3,very_hard:2},
}
Deno.serve(async(req)=>{
 const preflight=handleOptions(req); if(preflight)return preflight
 try{
  const {user,admin}=await authenticatedUser(req); const body=await req.json().catch(()=>({})); const translationAssistance=Boolean(body.translation_assistance); const cameraVerified=Boolean(body.camera_verified); const now=new Date()
  const {data:active}=await admin.from('exam_attempts').select('*').eq('user_id',user.id).eq('status','active').maybeSingle()
  if(active){if(new Date(active.expires_at)>now)return json({code:'ACTIVE_ATTEMPT',attempt_id:active.id},409);await admin.from('exam_attempts').update({status:'expired',submitted_at:now.toISOString(),updated_at:now.toISOString()}).eq('id',active.id)}
  const since=new Date(now.getTime()-COOLDOWN_HOURS*3600_000).toISOString()
  const {data:recent}=await admin.from('exam_attempts').select('submitted_at').eq('user_id',user.id).in('status',['submitted','expired']).gte('submitted_at',since).order('submitted_at',{ascending:false}).limit(1)
  if(recent?.length){const nextAt=new Date(new Date(recent[0].submitted_at).getTime()+COOLDOWN_HOURS*3600_000);return json({code:'COOLDOWN',next_attempt_at:nextAt.toISOString()},429)}
  const {data:allQuestions,error:qErr}=await admin.from('questions').select('id,concept_key,domain,difficulty,question_type,question_text,max_points').eq('is_active',true)
  if(qErr)throw qErr
  if((allQuestions??[]).length!==300)throw new Error(`Expected 300 active production questions, found ${(allQuestions??[]).length}`)
  const byConcept=new Map<string,any[]>()
  for(const q of allQuestions??[]){const l=byConcept.get(q.concept_key)??[];l.push(q);byConcept.set(q.concept_key,l)}
  if(byConcept.size!==60)throw new Error(`Expected 60 active concepts, found ${byConcept.size}`)
  // Assign exact difficulty quotas inside every domain. Every one of the 60 concepts is covered.
  const selected:any[]=[]
  for(const [domain,quota] of Object.entries(DOMAIN_DIFFICULTY)){
    const concepts=shuffle([...byConcept.entries()].filter(([,qs])=>qs[0]?.domain===domain))
    const required=quota.medium+quota.hard+quota.very_hard
    if(concepts.length!==required)throw new Error(`Domain ${domain}: expected ${required} concepts, found ${concepts.length}`)
    const plan=shuffle([
      ...Array(quota.medium).fill('medium'),
      ...Array(quota.hard).fill('hard'),
      ...Array(quota.very_hard).fill('very_hard'),
    ])
    for(let i=0;i<concepts.length;i++){
      const [concept,variants]=concepts[i]; const difficulty=plan[i]
      const candidates=variants.filter(q=>q.difficulty===difficulty)
      if(!candidates.length)throw new Error(`${concept}: no ${difficulty} variant available`)
      selected.push(shuffle(candidates)[0])
    }
  }
  const finalSelected=shuffle(selected)
  if(finalSelected.length!==60)throw new Error(`Selection produced ${finalSelected.length} questions instead of 60`)
  const counts=finalSelected.reduce((a:any,q:any)=>{a[q.difficulty]=(a[q.difficulty]||0)+1;return a},{})
  if(counts.medium!==9||counts.hard!==33||counts.very_hard!==18)throw new Error(`Difficulty quota mismatch: ${JSON.stringify(counts)}`)
  const expiresAt=new Date(now.getTime()+EXAM_MINUTES*60_000)
  if(!cameraVerified) return json({code:'CAMERA_REQUIRED',error:'Camera verification is required before the assessment starts.'},400)
  const {data:attempt,error:aErr}=await admin.from('exam_attempts').insert({user_id:user.id,started_at:now.toISOString(),expires_at:expiresAt.toISOString(),status:'active',translation_assistance:translationAssistance,camera_verified:cameraVerified}).select('*').single();if(aErr)throw aErr
  const ids=finalSelected.map(q=>q.id)
  const {data:opts,error:oErr}=await admin.from('question_options').select('id,question_id,option_text').in('question_id',ids);if(oErr)throw oErr
  const optsByQ=new Map<number,any[]>();for(const o of opts??[]){const l=optsByQ.get(o.question_id)??[];l.push(o);optsByQ.set(o.question_id,l)}
  const rows=finalSelected.map((q,i)=>({attempt_id:attempt.id,question_id:q.id,display_order:i+1,option_order:shuffle(optsByQ.get(q.id)??[]).map(o=>o.id)}))
  const {error:aqErr}=await admin.from('attempt_questions').insert(rows);if(aqErr)throw aqErr
  const payload=finalSelected.map((q,i)=>{const byId=new Map((optsByQ.get(q.id)??[]).map(o=>[o.id,o]));return{id:q.id,order:i+1,domain:q.domain,difficulty:q.difficulty,type:q.question_type,max_points:q.max_points,question:q.question_text,options:rows[i].option_order.map(id=>{const o=byId.get(id);return{id:o.id,text:o.option_text}})}})
  return json({attempt,questions:payload,answers:{},blueprint:{medium:9,hard:33,very_hard:18,total:60}})
 }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
})
