import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'

function sameSet(a:number[], b:number[]){
  const A=new Set(a.map(Number)), B=new Set(b.map(Number))
  return A.size===B.size && [...A].every(x=>B.has(x))
}

Deno.serve(async (req) => {
  const preflight=handleOptions(req); if(preflight) return preflight
  try {
    const { user, admin } = await authenticatedUser(req)
    const { attempt_id, question_id, selected_option_ids } = await req.json()
    if (!attempt_id || !question_id || !Array.isArray(selected_option_ids)) throw new Error('Invalid payload')
    const { data: attempt } = await admin.from('exam_attempts').select('*').eq('id',attempt_id).eq('user_id',user.id).single()
    if (!attempt || attempt.status !== 'active') throw new Error('Attempt is not active')
    if (new Date(attempt.expires_at) <= new Date()) throw new Error('Attempt expired')
    const { data: link } = await admin.from('attempt_questions').select('question_id,option_order,display_order').eq('attempt_id',attempt_id).eq('question_id',question_id).single()
    if (!link) throw new Error('Question is not in this attempt')
    const allowed = new Set(link.option_order.map(Number))
    const cleaned = [...new Set(selected_option_ids.map(Number))]
    if (cleaned.some((id:number)=>!allowed.has(Number(id)))) throw new Error('Invalid option')

    const { data: existing } = await admin.from('user_answers')
      .select('selected_option_ids,answered_at')
      .eq('attempt_id',attempt_id)
      .eq('question_id',question_id)
      .maybeSingle()
    const previous = (existing?.selected_option_ids ?? []).map(Number)
    const duplicate = Boolean(existing) && sameSet(previous, cleaned)
    const changed = Boolean(existing) && !duplicate

    const now = new Date().toISOString()
    const { error } = await admin.from('user_answers').upsert({
      attempt_id, question_id, selected_option_ids: cleaned, answered_at: now
    }, { onConflict:'attempt_id,question_id' })
    if (error) throw error

    // Server-side telemetry: this event cannot be skipped by ordinary UI manipulation
    // because every accepted answer save passes through this Edge Function.
    const { error: eventError } = await admin.from('attempt_events').insert({
      attempt_id,
      user_id:user.id,
      event_type:'answer_saved',
      event_data:{
        question_id:Number(question_id),
        display_order:Number(link.display_order),
        selection_count:cleaned.length,
        is_change:changed,
        duplicate,
      }
    })
    if (eventError) throw eventError

    return json({ ok:true })
  } catch(error){ return json({ error:error instanceof Error?error.message:String(error)},400) }
})
