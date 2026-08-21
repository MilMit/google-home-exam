import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
import { analyzeBehavior } from '../_shared/behavior.ts'

const requiredSections: Record<string, number> = { security: 70, network: 60, products: 60 }

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null
  const s = new Date(start).getTime(), e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null
  return Math.max(0, Math.round((e - s) / 1000))
}

function eventCounts(events: any[]) {
  const out: Record<string, number> = {}
  for (const e of events) out[e.event_type] = (out[e.event_type] ?? 0) + 1
  return out
}

function academicIssues(attempt: any) {
  const issues: any[] = []
  const overall = Number(attempt.percentage ?? 0)
  if (attempt.status === 'submitted' && overall < 80) {
    issues.push({ key: 'overall', score: overall, minimum: 80, severity: 'required', label: 'Overall score' })
  }
  const scores = attempt.section_scores ?? {}
  for (const [section, raw] of Object.entries(scores)) {
    const score = Number(raw ?? 0)
    const minimum = requiredSections[section]
    if (minimum != null && score < minimum) {
      issues.push({ key: section, score, minimum, severity: 'required', label: section })
    } else if (score < 80) {
      issues.push({ key: section, score, minimum: null, severity: 'advisory', label: section })
    }
  }
  return issues.sort((a, b) => a.score - b.score)
}

async function assertAdmin(req: Request) {
  const { user, admin } = await authenticatedUser(req)
  const body = await req.json().catch(() => ({}))
  const adminId = String(body.admin_id ?? '').trim()
  const { data: adminRow } = await admin.from('admin_users')
    .select('admin_id,display_name,is_active')
    .eq('user_id', user.id)
    .eq('admin_id', adminId)
    .eq('is_active', true)
    .maybeSingle()
  if (!adminRow) throw Object.assign(new Error('Administrator access denied'), { status: 403 })
  return { user, admin, body, adminRow }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight
  try {
    const { admin, body, adminRow } = await assertAdmin(req)
    const attemptId = body.attempt_id ? String(body.attempt_id) : null

    if (attemptId) {
      const { data: attempt, error: aErr } = await admin.from('exam_attempts')
        .select('id,user_id,started_at,expires_at,submitted_at,status,score,max_score,percentage,passed,section_scores,translation_assistance,camera_verified,integrity_score,integrity_status,security_summary')
        .eq('id', attemptId).maybeSingle()
      if (aErr) throw aErr
      if (!attempt) return json({ error: 'Attempt not found' }, 404)

      const [{ data: events, error: eErr }, { count: questionCount }, { count: answerCount }] = await Promise.all([
        admin.from('attempt_events').select('id,event_type,event_data,created_at').eq('attempt_id', attemptId).order('created_at', { ascending: true }),
        admin.from('attempt_questions').select('*', { count: 'exact', head: true }).eq('attempt_id', attemptId),
        admin.from('user_answers').select('*', { count: 'exact', head: true }).eq('attempt_id', attemptId),
      ])
      if (eErr) throw eErr

      const { data: userData } = await admin.auth.admin.getUserById(attempt.user_id)
      const ev = events ?? []
      const counts = eventCounts(ev)
      const summary = attempt.security_summary ?? {}
      const translationGrace = Number(summary.translation_grace ?? (attempt.translation_assistance ? 1 : 0))
      const rawFullscreen = Number(summary.fullscreen_exit ?? counts.fullscreen_exit ?? 0)
      const penalizedFullscreen = Number(summary.fullscreen_penalized ?? Math.max(0, rawFullscreen - translationGrace))

      const behavior = analyzeBehavior(ev, attempt, Number(attempt.percentage ?? 0))
      const integrityIssues = [
        { key: 'camera_stopped', label: 'Camera interruption', count: Number(counts.camera_stopped ?? 0), severity: 'high', penalized: true },
        { key: 'tab_hidden', label: 'Assessment tab hidden / switched', count: Number(counts.tab_hidden ?? 0), severity: 'high', penalized: true },
        { key: 'fullscreen_exit', label: 'Penalized fullscreen exit', count: penalizedFullscreen, raw_count: rawFullscreen, grace: translationGrace, severity: 'medium', penalized: true },
        { key: 'copy_attempt', label: 'Copy attempt', count: Number(counts.copy_attempt ?? 0), severity: 'high', penalized: true },
        { key: 'paste_attempt', label: 'Paste attempt', count: Number(counts.paste_attempt ?? 0), severity: 'high', penalized: true },
        { key: 'network_offline', label: 'Network interruption', count: Number(counts.network_offline ?? 0), severity: 'low', penalized: true },
        { key: 'window_blur', label: 'Window focus lost', count: Number(counts.window_blur ?? 0), severity: 'info', penalized: false },
        ...behavior.issues,
      ].filter(x => Number(x.count ?? 0) > 0)

      const endTime = attempt.submitted_at ?? (attempt.status === 'active' ? new Date().toISOString() : attempt.expires_at)
      const finalStatus = attempt.status === 'submitted'
        ? (attempt.passed ? (attempt.integrity_status === 'review' ? 'Pending Review' : 'Passed') : 'Not Passed')
        : attempt.status

      return json({
        admin: adminRow,
        attempt: { ...attempt, email: userData?.user?.email ?? attempt.user_id, final_status: finalStatus },
        report: {
          duration_seconds: secondsBetween(attempt.started_at, endTime),
          question_count: questionCount ?? 0,
          answered_count: answerCount ?? 0,
          event_counts: counts,
          integrity_issues: integrityIssues,
          academic_issues: academicIssues(attempt),
          behavior: behavior.summary,
          behavior_penalty: behavior.penalty,
          behavior_critical: behavior.critical,
          timeline: ev,
        },
      })
    }

    const [{ count: activeQuestions }, { count: submittedAttempts }, { count: pendingReview }, { count: activeAttempts }, { data: recent }] = await Promise.all([
      admin.from('questions').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('exam_attempts').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      admin.from('exam_attempts').select('*', { count: 'exact', head: true }).eq('integrity_status', 'review'),
      admin.from('exam_attempts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('exam_attempts').select('id,user_id,started_at,submitted_at,status,percentage,passed,section_scores,integrity_score,integrity_status,translation_assistance,camera_verified,security_summary').order('started_at', { ascending: false }).limit(50),
    ])
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emails = new Map((userList?.users ?? []).map(u => [u.id, u.email ?? u.id]))
    const attempts = (recent ?? []).map(a => ({ ...a, email: emails.get(a.user_id) ?? a.user_id }))
    return json({
      admin: adminRow,
      metrics: {
        active_questions: activeQuestions ?? 0,
        submitted_attempts: submittedAttempts ?? 0,
        pending_review: pendingReview ?? 0,
        active_attempts: activeAttempts ?? 0,
      },
      recent_attempts: attempts,
    })
  } catch (error: any) {
    return json({ error: error instanceof Error ? error.message : String(error) }, error?.status ?? 400)
  }
})
