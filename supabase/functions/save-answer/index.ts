import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
Deno.serve(async (req) => {
  const preflight=handleOptions(req); if(preflight) return preflight
  try {
    const { user, admin } = await authenticatedUser(req)
    const { attempt_id, question_id, selected_option_ids } = await req.json()
    if (!attempt_id || !question_id || !Array.isArray(selected_option_ids)) throw new Error('Invalid payload')
    const { data: attempt } = await admin.from('exam_attempts').select('*').eq('id',attempt_id).eq('user_id',user.id).single()
    if (!attempt || attempt.status !== 'active') throw new Error('Attempt is not active')
    if (new Date(attempt.expires_at) <= new Date()) throw new Error('Attempt expired')
    const { data: link } = await admin.from('attempt_questions').select('question_id,option_order').eq('attempt_id',attempt_id).eq('question_id',question_id).single()
    if (!link) throw new Error('Question is not in this attempt')
    const allowed = new Set(link.option_order.map(Number))
    if (selected_option_ids.some((id:number)=>!allowed.has(Number(id)))) throw new Error('Invalid option')
    const { error } = await admin.from('user_answers').upsert({ attempt_id, question_id, selected_option_ids: [...new Set(selected_option_ids.map(Number))], answered_at:new Date().toISOString() }, { onConflict:'attempt_id,question_id' })
    if (error) throw error
    return json({ ok:true })
  } catch(error){ return json({ error:error instanceof Error?error.message:String(error)},400) }
})
