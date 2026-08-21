import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
const requiredSections: Record<string,number> = { security:70, network:60, products:60 }
function sameSet(a:number[],b:number[]){const A=new Set(a.map(Number)),B=new Set(b.map(Number));return A.size===B.size&&[...A].every(x=>B.has(x))}
function count(events:any[],type:string){return events.filter(e=>e.event_type===type).length}
Deno.serve(async(req)=>{
  const preflight=handleOptions(req); if(preflight) return preflight
  try{
    const {user,admin}=await authenticatedUser(req); const {attempt_id}=await req.json()
    const {data:attempt}=await admin.from('exam_attempts').select('*').eq('id',attempt_id).eq('user_id',user.id).single()
    if(!attempt) throw new Error('Attempt not found')
    if(attempt.status==='submitted') return json({attempt})
    const expired=new Date(attempt.expires_at)<=new Date()
    const {data:links}=await admin.from('attempt_questions').select('question_id').eq('attempt_id',attempt_id)
    const ids=(links??[]).map(x=>x.question_id)
    const {data:qs}=await admin.from('questions').select('id,domain,question_type,max_points').in('id',ids)
    const {data:opts}=await admin.from('question_options').select('id,question_id,is_correct').in('question_id',ids)
    const {data:answers}=await admin.from('user_answers').select('question_id,selected_option_ids').eq('attempt_id',attempt_id)
    const ansMap=new Map((answers??[]).map(a=>[a.question_id,a.selected_option_ids.map(Number)])),optMap=new Map<number,any[]>()
    for(const o of opts??[]){const l=optMap.get(o.question_id)??[];l.push(o);optMap.set(o.question_id,l)}
    let score=0,maxScore=0;const sections:Record<string,{score:number,max:number}>={}
    for(const q of qs??[]){
      const correct=(optMap.get(q.id)??[]).filter(o=>o.is_correct).map(o=>Number(o.id)),selected=ansMap.get(q.id)??[];let earned=0;const max=Number(q.max_points)
      if(q.question_type==='multiple'){
        const wrong=selected.some((x:number)=>!correct.includes(x))
        if(!wrong&&sameSet(selected,correct))earned=max;else if(!wrong&&selected.length>0&&selected.every((x:number)=>correct.includes(x)))earned=max/2
      }else if(sameSet(selected,correct))earned=max
      score+=earned;maxScore+=max;if(!sections[q.domain])sections[q.domain]={score:0,max:0};sections[q.domain].score+=earned;sections[q.domain].max+=max
    }
    const percentage=maxScore?Math.round((score/maxScore)*10000)/100:0
    const sectionScores=Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,Math.round((v.score/v.max)*10000)/100]))
    const passed=!expired&&percentage>=80&&Object.entries(requiredSections).every(([k,min])=>(sectionScores[k]??0)>=min)

    const {data:events}=await admin.from('attempt_events').select('event_type,event_data,created_at').eq('attempt_id',attempt_id)
    const ev=events??[]
    const translationGrace=attempt.translation_assistance?1:0
    const fullExit=Math.max(0,count(ev,'fullscreen_exit')-translationGrace)
    const tabHidden=count(ev,'tab_hidden'),cameraStopped=count(ev,'camera_stopped'),offline=count(ev,'network_offline'),copy=count(ev,'copy_attempt'),paste=count(ev,'paste_attempt')
    const penalty=Math.min(35,tabHidden*10)+Math.min(35,cameraStopped*25)+Math.min(20,fullExit*8)+Math.min(10,offline*2)+Math.min(20,(copy+paste)*4)
    const integrityScore=Math.max(0,100-penalty)
    const integrityStatus=integrityScore>=80?'valid':'review'
    const securitySummary={tab_hidden:tabHidden,camera_stopped:cameraStopped,fullscreen_exit:count(ev,'fullscreen_exit'),fullscreen_penalized:fullExit,network_offline:offline,copy_attempt:copy,paste_attempt:paste,translation_grace:translationGrace}

    const update={status:expired?'expired':'submitted',submitted_at:new Date().toISOString(),score,max_score:maxScore,percentage,passed,section_scores:sectionScores,integrity_score:integrityScore,integrity_status:integrityStatus,security_summary:securitySummary,updated_at:new Date().toISOString()}
    const {data:final,error}=await admin.from('exam_attempts').update(update).eq('id',attempt_id).select('*').single();if(error)throw error
    return json({attempt:final,answered_count:ansMap.size,total_questions:ids.length})
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
})
