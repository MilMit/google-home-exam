import { authenticatedUser, handleOptions, json, shuffle } from '../_shared/common.ts'

const EXAM_MINUTES = 75
const COOLDOWN_HOURS = 24

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight
  try {
    const { user, admin } = await authenticatedUser(req)
    const now = new Date()

    const { data: active } = await admin.from('exam_attempts')
      .select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle()
    if (active) {
      if (new Date(active.expires_at) > now) return json({ code: 'ACTIVE_ATTEMPT', attempt_id: active.id }, 409)
      await admin.from('exam_attempts').update({ status: 'expired', submitted_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', active.id)
    }

    const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 3600_000).toISOString()
    const { data: recent } = await admin.from('exam_attempts')
      .select('submitted_at,started_at,status').eq('user_id', user.id)
      .in('status', ['submitted','expired']).gte('submitted_at', cooldownSince)
      .order('submitted_at', { ascending: false }).limit(1)
    if (recent && recent.length) {
      const nextAt = new Date(new Date(recent[0].submitted_at).getTime() + COOLDOWN_HOURS * 3600_000)
      return json({ code: 'COOLDOWN', next_attempt_at: nextAt.toISOString() }, 429)
    }

    const { data: allQuestions, error: qErr } = await admin.from('questions')
      .select('id,concept_key,domain,difficulty,question_type,question_text,max_points')
      .eq('is_active', true)
    if (qErr) throw qErr

    const byConcept = new Map<string, any[]>()
    for (const q of allQuestions ?? []) {
      const list = byConcept.get(q.concept_key) ?? []
      list.push(q); byConcept.set(q.concept_key, list)
    }
    if (byConcept.size !== 60) throw new Error(`Expected 60 active concepts, found ${byConcept.size}`)

    const selected = shuffle([...byConcept.values()].map(v => shuffle(v)[0]))
    const startedAt = now
    const expiresAt = new Date(now.getTime() + EXAM_MINUTES * 60_000)
    const { data: attempt, error: aErr } = await admin.from('exam_attempts').insert({
      user_id: user.id, started_at: startedAt.toISOString(), expires_at: expiresAt.toISOString(), status: 'active'
    }).select('*').single()
    if (aErr) throw aErr

    const ids = selected.map(q => q.id)
    const { data: opts, error: oErr } = await admin.from('question_options')
      .select('id,question_id,option_text').in('question_id', ids)
    if (oErr) throw oErr
    const optsByQ = new Map<number, any[]>()
    for (const o of opts ?? []) { const list = optsByQ.get(o.question_id) ?? []; list.push(o); optsByQ.set(o.question_id, list) }

    const rows = selected.map((q, i) => ({
      attempt_id: attempt.id, question_id: q.id, display_order: i + 1,
      option_order: shuffle(optsByQ.get(q.id) ?? []).map(o => o.id)
    }))
    const { error: aqErr } = await admin.from('attempt_questions').insert(rows)
    if (aqErr) throw aqErr

    const questionPayload = selected.map((q, i) => {
      const byId = new Map((optsByQ.get(q.id) ?? []).map(o => [o.id, o]))
      return {
        id: q.id, order: i + 1, domain: q.domain, difficulty: q.difficulty,
        type: q.question_type, max_points: q.max_points,
        question: q.question_text,
        options: rows[i].option_order.map(id => { const o = byId.get(id); return { id: o.id, text: o.option_text } }),
      }
    })
    return json({ attempt, questions: questionPayload, answers: {} })
  } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400) }
})
