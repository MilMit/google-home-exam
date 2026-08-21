export type IntegrityEvent = {
  event_type: string
  event_data?: Record<string, unknown> | null
  created_at?: string | null
}

export type BehaviorIssue = {
  key: string
  label: string
  count: number
  severity: 'high' | 'medium' | 'low' | 'info'
  penalized: boolean
  detail?: string
}

function eventMs(e: IntegrityEvent) {
  const n = e.created_at ? new Date(e.created_at).getTime() : NaN
  return Number.isFinite(n) ? n : 0
}

function qid(e: IntegrityEvent) {
  const raw = e.event_data?.question_id
  return raw == null ? '' : String(raw)
}

function maxInWindow(times: number[], windowMs: number) {
  if (!times.length) return 0
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0, left = 0
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++
    best = Math.max(best, right - left + 1)
  }
  return best
}

function median(values: number[]) {
  if (!values.length) return null
  const a = [...values].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

export function analyzeBehavior(events: IntegrityEvent[], attempt?: any, percentage?: number | null) {
  const ordered = [...(events ?? [])].sort((a, b) => eventMs(a) - eventMs(b))
  const lastView = new Map<string, number>()
  const seenAnswered = new Set<string>()
  const saveCounts = new Map<string, number>()
  const firstAnswerTimes: number[] = []
  const viewTimes: number[] = []
  const dwellSeconds: number[] = []
  let hidden = false
  let blurred = false
  let lastTabReturnAt = 0
  let lastFocusReturnAt = 0
  let noViewAnswers = 0
  let backgroundAnswers = 0
  let rapidFirstAnswers = 0
  let postTabReturnAnswers = 0
  let postFocusReturnAnswers = 0

  for (const e of ordered) {
    const t = eventMs(e)
    if (!t) continue
    if (e.event_type === 'tab_hidden') hidden = true
    if (e.event_type === 'tab_visible') { if (hidden) lastTabReturnAt = t; hidden = false }
    if (e.event_type === 'window_blur') blurred = true
    if (e.event_type === 'window_focus') { if (blurred) lastFocusReturnAt = t; blurred = false }

    if (e.event_type === 'question_view') {
      const q = qid(e)
      if (q) lastView.set(q, t)
      viewTimes.push(t)
      continue
    }

    if (e.event_type !== 'answer_saved') continue
    if (e.event_data?.duplicate === true) continue
    const q = qid(e)
    if (!q) continue
    saveCounts.set(q, (saveCounts.get(q) ?? 0) + 1)

    if (!seenAnswered.has(q)) {
      seenAnswered.add(q)
      firstAnswerTimes.push(t)
      const viewedAt = lastView.get(q)
      if (hidden) backgroundAnswers++
      if (lastTabReturnAt && t - lastTabReturnAt <= 8000) { postTabReturnAnswers++; lastTabReturnAt = 0 }
      if (lastFocusReturnAt && t - lastFocusReturnAt <= 8000) { postFocusReturnAnswers++; lastFocusReturnAt = 0 }
      if (viewedAt == null) {
        noViewAnswers++
      } else {
        const dwell = Math.max(0, (t - viewedAt) / 1000)
        dwellSeconds.push(dwell)
        if (dwell <= 3.5) rapidFirstAnswers++
      }
    }
  }

  const repeatedChangeQuestions = [...saveCounts.values()].filter(n => n >= 5).length
  const answerBurst30s = maxInWindow(firstAnswerTimes, 30000)
  const rapidNavigation15s = maxInWindow(viewTimes, 15000)
  const medianDwell = median(dwellSeconds)
  const answeredCount = firstAnswerTimes.length

  let durationSeconds: number | null = null
  if (attempt?.started_at) {
    const endRaw = attempt?.submitted_at ?? attempt?.expires_at
    const start = new Date(attempt.started_at).getTime(), end = endRaw ? new Date(endRaw).getTime() : NaN
    if (Number.isFinite(start) && Number.isFinite(end)) durationSeconds = Math.max(0, Math.round((end - start) / 1000))
  }
  const pct = Number(percentage ?? attempt?.percentage ?? 0)
  const fastHighScore = answeredCount >= 50 && pct >= 80 && durationSeconds != null && durationSeconds < 20 * 60

  let penalty = 0
  const issues: BehaviorIssue[] = []
  const add = (issue: BehaviorIssue, points: number) => { issues.push(issue); penalty += points }

  if (backgroundAnswers > 0) add({
    key: 'background_answer', label: 'Answer submitted while assessment tab was hidden', count: backgroundAnswers,
    severity: 'high', penalized: true, detail: `${backgroundAnswers} first-answer event(s) occurred while the page was not visible.`
  }, Math.min(24, backgroundAnswers * 12))

  if (noViewAnswers > 0) add({
    key: 'answer_without_view', label: 'Answer saved without a recorded question view', count: noViewAnswers,
    severity: noViewAnswers >= 3 ? 'high' : 'medium', penalized: true,
    detail: 'The server received an answer for a question without a prior recorded view event in this attempt.'
  }, Math.min(24, noViewAnswers * 8))

  if (postTabReturnAnswers > 0) issues.push({
    key: 'answer_after_tab_return', label: 'Answer shortly after returning from another tab', count: postTabReturnAnswers,
    severity: postTabReturnAnswers >= 3 ? 'high' : 'medium', penalized: false,
    detail: `${postTabReturnAnswers} first answer(s) were submitted within 8 seconds of returning to the assessment tab. This pattern is shown for manual review and is not separately double-penalized from tab switching.`
  })

  if (postFocusReturnAnswers > 0) add({
    key: 'answer_after_window_focus', label: 'Answer shortly after window focus returned', count: postFocusReturnAnswers,
    severity: postFocusReturnAnswers >= 3 ? 'high' : 'medium', penalized: true,
    detail: `${postFocusReturnAnswers} first answer(s) were submitted within 8 seconds of the assessment window regaining focus.`
  }, Math.min(15, postFocusReturnAnswers * 5))

  if (answerBurst30s >= 8) add({
    key: 'answer_burst', label: 'Unusually dense answer burst', count: answerBurst30s,
    severity: answerBurst30s >= 10 ? 'high' : 'medium', penalized: true,
    detail: `Up to ${answerBurst30s} first answers were recorded within a 30-second window.`
  }, answerBurst30s >= 10 ? 18 : 12)

  if (medianDwell != null && dwellSeconds.length >= 20 && medianDwell < 5) add({
    key: 'implausible_pace', label: 'Very low median reading / response time', count: rapidFirstAnswers,
    severity: medianDwell < 3 ? 'high' : 'medium', penalized: true,
    detail: `Median time from question view to first answer was ${medianDwell.toFixed(1)} seconds across ${dwellSeconds.length} measured questions.`
  }, medianDwell < 3 ? 15 : 8)

  if (rapidFirstAnswers >= 8) add({
    key: 'rapid_answers', label: 'Repeated very-fast first answers', count: rapidFirstAnswers,
    severity: rapidFirstAnswers >= 15 ? 'high' : 'medium', penalized: true,
    detail: `${rapidFirstAnswers} questions were first answered within 3.5 seconds of being viewed.`
  }, rapidFirstAnswers >= 15 ? 12 : 6)

  if (repeatedChangeQuestions >= 4) add({
    key: 'repeated_answer_changes', label: 'Excessive repeated answer changes', count: repeatedChangeQuestions,
    severity: repeatedChangeQuestions >= 8 ? 'medium' : 'low', penalized: true,
    detail: `${repeatedChangeQuestions} question(s) had five or more server-recorded answer saves.`
  }, repeatedChangeQuestions >= 8 ? 8 : 4)

  if (rapidNavigation15s >= 12) add({
    key: 'rapid_navigation', label: 'Very rapid question navigation', count: rapidNavigation15s,
    severity: 'low', penalized: true,
    detail: `Up to ${rapidNavigation15s} question-view events occurred within 15 seconds.`
  }, 4)

  if (fastHighScore) add({
    key: 'fast_high_score', label: 'High score with unusually short completion time', count: 1,
    severity: 'medium', penalized: true,
    detail: `A score of ${pct}% was completed in approximately ${Math.round((durationSeconds ?? 0) / 60)} minutes.`
  }, 10)

  penalty = Math.min(45, penalty)
  const critical = backgroundAnswers > 0 || noViewAnswers >= 3 || answerBurst30s >= 10 || postTabReturnAnswers >= 3 || postFocusReturnAnswers >= 3
  return {
    penalty,
    critical,
    issues,
    summary: {
      answered_count: answeredCount,
      measured_dwell_count: dwellSeconds.length,
      median_first_answer_seconds: medianDwell == null ? null : Math.round(medianDwell * 10) / 10,
      rapid_first_answers: rapidFirstAnswers,
      answer_without_view: noViewAnswers,
      background_answers: backgroundAnswers,
      answer_after_tab_return: postTabReturnAnswers,
      answer_after_window_focus: postFocusReturnAnswers,
      repeated_change_questions: repeatedChangeQuestions,
      max_first_answers_30s: answerBurst30s,
      max_question_views_15s: rapidNavigation15s,
      fast_high_score: fastHighScore,
      flag_count: issues.length,
    },
  }
}
