import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight
  try {
    const { user, admin } = await authenticatedUser(req)
    const { data: attempt } = await admin.from('exam_attempts').select('*').eq('user_id', user.id).eq('status','active').maybeSingle()
    if (!attempt) return json({ attempt: null, questions: [], answers: {} })
    if (new Date(attempt.expires_at) <= new Date()) return json({ code: 'EXPIRED', attempt_id: attempt.id }, 410)
    const { data: links, error } = await admin.from('attempt_questions').select('question_id,display_order,option_order').eq('attempt_id', attempt.id).order('display_order')
    if (error) throw error
    const ids = (links ?? []).map(x => x.question_id)
    const { data: qs } = await admin.from('questions').select('id,domain,difficulty,question_type,question_text,max_points').in('id',ids)
    const { data: os } = await admin.from('question_options').select('id,question_id,option_text').in('question_id',ids)
    const qMap = new Map((qs ?? []).map(q => [q.id,q])); const oMap = new Map<number,Map<number,any>>()
    for (const o of os ?? []) { if (!oMap.has(o.question_id)) oMap.set(o.question_id,new Map()); oMap.get(o.question_id)!.set(o.id,o) }
    const questions = (links ?? []).map(l => { const q=qMap.get(l.question_id); return { id:q.id, order:l.display_order, domain:q.domain, difficulty:q.difficulty, type:q.question_type, max_points:q.max_points, question:q.question_text, options:l.option_order.map((id:number)=>{ const o=oMap.get(q.id)?.get(id); return { id:o.id, text:o.option_text } }) } })
    const { data: ans } = await admin.from('user_answers').select('question_id,selected_option_ids').eq('attempt_id',attempt.id)
    const answers = Object.fromEntries((ans ?? []).map(a => [a.question_id, a.selected_option_ids]))
    return json({ attempt, questions, answers })
  } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400) }
})
