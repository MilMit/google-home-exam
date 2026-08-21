const cfg = window.EXAM_CONFIG || {}
const app = document.querySelector('#app')
const langBtn = document.querySelector('#langBtn')
const logoutBtn = document.querySelector('#logoutBtn')
const adminBtn = document.querySelector('#adminBtn')

const state = {
  lang: localStorage.lang || 'fa',
  session: JSON.parse(localStorage.session || 'null'),
  attempt: null,
  questions: [],
  answers: {},
  index: 0,
  marked: new Set(),
  result: null,
  timer: null,
  demo: false,
  translationAssistance: false,
  cameraStream: null,
  cameraReady: false,
  auditAttached: false,
  securityNotice: null,
}

const tr = (fa,en)=>state.lang==='fa'?fa:en
const esc = s=>String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]||m))

function direction(){
  // The assessment source language is English even when the surrounding UI is Persian.
  // Declaring the document as English during an active question helps Chrome/Edge
  // detect and translate dynamically-rendered question content.
  const examContentActive = state.questions.length > 0
  document.documentElement.lang = examContentActive ? 'en' : state.lang
  document.documentElement.dir=state.lang==='fa'?'rtl':'ltr'
  langBtn.textContent=state.lang==='fa'?'EN':'فا'
}

function markQuestionForBrowserTranslation(){
  document.documentElement.lang='en'
  document.querySelectorAll('.english-content').forEach(el=>{
    el.setAttribute('lang','en')
    el.setAttribute('translate','yes')
  })
  const card=document.querySelector('.question-card')
  if(card){
    card.setAttribute('lang','en')
    card.setAttribute('translate','yes')
  }
}
function saveSession(s){
  state.session=s
  localStorage.session=JSON.stringify(s)
  logoutBtn.classList.toggle('hidden',!s)
}
function showError(message){return `<div class="notice error">${esc(message)}</div>`}
function showSuccess(message){return `<div class="notice success">${esc(message)}</div>`}

async function authFetch(path, options={}){
  const base=cfg.SUPABASE_URL, key=cfg.SUPABASE_PUBLISHABLE_KEY
  if(!base||!key) throw new Error(tr('پیکربندی Supabase انجام نشده است.','Supabase is not configured.'))
  await refreshIfNeeded()
  const headers={'Content-Type':'application/json','apikey':key,...(options.headers||{})}
  if(state.session?.access_token) headers.Authorization=`Bearer ${state.session.access_token}`
  const res=await fetch(`${base}${path}`,{...options,headers})
  const body=await res.json().catch(()=>({}))
  if(!res.ok) throw Object.assign(new Error(body.error||body.msg||body.message||`HTTP ${res.status}`),{status:res.status,body})
  return body
}
async function refreshIfNeeded(){
  if(!state.session?.refresh_token) return
  const exp=(state.session.expires_at||0)*1000
  if(Date.now()<exp-120000) return
  const res=await fetch(`${cfg.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({refresh_token:state.session.refresh_token})
  })
  if(!res.ok){saveSession(null);return}
  const s=await res.json(); s.expires_at=Math.floor(Date.now()/1000)+s.expires_in; saveSession(s)
}
async function functionCall(name,payload={}){return authFetch(`/functions/v1/${name}`,{method:'POST',body:JSON.stringify(payload)})}

const demoQuestions=[
 {id:1,domain:'products',type:'single',question:'[Demo] Which Google product is a smart display?',options:['Nest Hub','Nest Audio','Nest Wifi Pro','Nest Cam'],correct:[0]},
 {id:2,domain:'network',type:'single',question:'[Demo] What does a Thread Border Router do?',options:['Connects the Thread network to the home IP network','Improves HDMI quality','Stores video','Charges batteries'],correct:[0]},
 {id:3,domain:'appliances',type:'multiple',question:'[Demo] Which conditions are commonly needed for washer Remote Start?',options:['Door closed','Remote Start armed','Eligible cycle','HDMI cable'],correct:[0,1,2]},
 {id:4,domain:'security',type:'single',question:'[Demo] What is the best household-member practice?',options:['Least-privilege access per person','One shared account for all','Disable 2FA','Publish the password'],correct:[0]},
 {id:5,domain:'automation',type:'single',question:'[Demo] What is a key principle for heating-appliance automation?',options:['Fail-safe design','Unattended activation','Remove manufacturer limits','Ignore errors'],correct:[0]},
 {id:6,domain:'troubleshooting',type:'single',question:'[Demo] If a device is online in its manufacturer app but offline in Google Home, what should be checked?',options:['Account link and cloud service','TV cable','Device colour','Speaker volume'],correct:[0]}
].map(q=>({...q,options:q.options.map((text,i)=>({id:i+1,text}))}))

function clearExamRuntime(){
  clearInterval(state.timer)
  state.attempt=null;state.questions=[];state.answers={};state.index=0;state.marked=new Set();state.result=null;state.demo=false
  detachAudit(); stopCamera(false); removeWatermark(); removeSecurityBanner()
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{})
}

function home(){
  app.innerHTML=`<section class="hero"><div><div class="pill">${tr('ارزیابی حرفه‌ای با سؤالات انگلیسی','Professional assessment with English-only questions')}</div><h1>${tr('آزمون سختِ خانه هوشمند Google','Advanced Google Smart Home Assessment')}</h1><p class="lead">${tr('۶۰ سؤال سناریویی انگلیسی از بانک ۳۰۰ سؤالی، ۷۵ دقیقه زمان، نمره قبولی ۸۰٪ و کنترل یکپارچگی جلسه. ترجمه داخلی مرورگر مجاز است.','60 English-only scenario-based questions drawn from a 300-question bank, 75 minutes, an 80% pass mark, and session integrity monitoring. Built-in browser translation is allowed.')}</p><div class="actions"><button class="btn" id="beginBtn">${tr('ورود و شروع','Sign in and begin')}</button><button class="btn secondary" id="demoBtn">${tr('پیش‌نمایش نمونه','Open demo preview')}</button></div>${cfg.DEMO_MODE?`<div class="notice">${tr('سایت فعلاً در حالت پیش‌نمایش است.','The site is currently in preview mode.')}</div>`:''}</div><div class="hero-art"><img src="assets/nest-audio.png"><img src="assets/nest-hub.png"><img src="assets/nest-cam.png"><img src="assets/google-tv-streamer.png"></div></section><section class="grid grid-3" style="margin-top:38px"><div class="card stat"><strong>300</strong><span>${tr('سؤال در بانک خصوصی','questions in the private bank')}</span></div><div class="card stat"><strong>60</strong><span>${tr('سؤال در هر نوبت','questions per attempt')}</span></div><div class="card stat"><strong>75</strong><span>${tr('دقیقه زمان','minutes')}</span></div></section>`
  document.querySelector('#beginBtn').onclick=()=>state.session?rules():authPage()
  document.querySelector('#demoBtn').onclick=startDemo
}

function authPage(message=''){
  app.innerHTML=`<section class="card auth"><h1>${tr('ورود به آزمون','Assessment sign-in')}</h1>${message?showError(message):''}<div class="field"><label>${tr('ایمیل','Email')}</label><input id="email" type="email" autocomplete="email"></div><div class="field"><label>${tr('رمز عبور','Password')}</label><input id="password" type="password" minlength="8"></div><div class="actions"><button class="btn" id="login">${tr('ورود','Sign in')}</button><button class="btn secondary" id="signup">${tr('ساخت حساب','Create account')}</button><button class="ghost" id="back">${tr('بازگشت','Back')}</button></div></section>`
  document.querySelector('#back').onclick=home
  document.querySelector('#login').onclick=()=>doAuth('login')
  document.querySelector('#signup').onclick=()=>doAuth('signup')
}
async function doAuth(mode){
  const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value
  try{
    const path=mode==='login'?'/auth/v1/token?grant_type=password':'/auth/v1/signup'
    const data=await authFetch(path,{method:'POST',body:JSON.stringify({email,password})})
    if(data.access_token){data.expires_at=Math.floor(Date.now()/1000)+data.expires_in;saveSession(data);rules()}
    else authPage(tr('حساب ساخته شد. ایمیل تأیید را بررسی کنید.','Account created. Check your email for confirmation.'))
  }catch(e){authPage(e.message)}
}

function rules(){
  app.innerHTML=`<section class="card rules"><h1>${tr('قوانین آزمون','Assessment rules')}</h1><ul>
  <li>${tr('متن اصلی سؤال‌ها و گزینه‌ها انگلیسی است. استفاده از قابلیت ترجمه داخلی مرورگر مانند Chrome Translate / Edge Translate مجاز است.','The original question and option text is in English. Built-in browser translation such as Chrome Translate or Edge Translate is allowed.')}</li>
  <li>${tr('استفاده از سایت ترجمه، هوش مصنوعی، جست‌وجوی وب، ارسال سؤال برای شخص دیگر یا کپی سؤال در ابزار خارجی مجاز نیست.','External translation websites, AI tools, web search, sending questions to another person, or copying questions into external tools are not allowed.')}</li>
  <li>${tr('اگر ترجمه مرورگر می‌خواهید، بهتر است همین صفحه را قبل از ورود به حالت تمام‌صفحه با قابلیت Translate مرورگر ترجمه کنید.','If you want browser translation, translate this page with the browser before entering fullscreen mode.')}</li>
  <li>${tr('۶۰ سؤال در ۷۵ دقیقه؛ بانک سؤال ۳۰۰ مورد است و هر نوبت ترکیب متفاوتی دارد.','60 questions in 75 minutes; the private bank contains 300 questions and each attempt uses a different selection.')}</li>
  <li>${tr('حد قبولی کل ۸۰٪ است؛ امنیت حداقل ۷۰٪ و شبکه و محصولات هرکدام حداقل ۶۰٪.','Overall pass mark is 80%; security requires 70%, and networking and products each require 60%.')}</li>
  <li>${tr('برای آزمون واقعی، دسترسی دوربین لازم است. تصویر فقط به‌صورت زنده روی دستگاه شما نمایش داده می‌شود و در این نسخه هیچ عکس یا ویدئویی ذخیره نمی‌شود.','Camera access is required for the real assessment. Your live image is shown only on your device; this version does not record or upload photos or video.')}</li>
  <li>${tr('خروج از تمام‌صفحه، تغییر تب، قطع دوربین، قطع شبکه و تلاش برای Copy/Paste ثبت می‌شود.','Fullscreen exits, tab changes, camera interruption, network interruption, and copy/paste attempts are logged.')}</li>
  <li>${tr('نتیجه بلافاصله بعد از ثبت نهایی نمایش داده می‌شود؛ پاسخ‌های صحیح نمایش داده نمی‌شوند.','The result is shown immediately after final submission; correct answers are not revealed.')}</li>
  </ul>
  <label class="option"><input type="checkbox" id="translateAssist"><span>${tr('ممکن است از ترجمه داخلی مرورگر استفاده کنم.','I may use built-in browser translation assistance.')}</span></label>
  <label class="option"><input type="checkbox" id="agree"><span>${tr('قوانین را خواندم و می‌پذیرم.','I have read and accept the rules.')}</span></label>
  <div class="actions"><button class="btn" id="start">${tr('بررسی سیستم و شروع','System check and start')}</button><button class="ghost" id="back">${tr('بازگشت','Back')}</button></div><div id="ruleMsg"></div></section>`
  document.querySelector('#translateAssist').checked=state.translationAssistance
  document.querySelector('#back').onclick=home
  document.querySelector('#start').onclick=()=>{
    if(!document.querySelector('#agree').checked){document.querySelector('#ruleMsg').innerHTML=showError(tr('ابتدا قوانین را تأیید کنید.','Please accept the rules first.'));return}
    state.translationAssistance=document.querySelector('#translateAssist').checked
    systemCheck()
  }
}

function systemCheck(message=''){
  app.innerHTML=`<section class="card system-check"><h1>${tr('بررسی سیستم','System check')}</h1>${message?showError(message):''}<p class="lead">${tr('برای شروع، دوربین باید فعال باشد و مرورگر از حالت تمام‌صفحه پشتیبانی کند. هیچ تصویر یا ویدئویی آپلود نمی‌شود.','To begin, the camera must be available and the browser must support fullscreen. No photo or video is uploaded.')}</p><div class="check-grid"><div class="check-item"><b>${tr('اینترنت','Internet')}</b><span class="${navigator.onLine?'ok':'bad'}">${navigator.onLine?'✓ Online':'✕ Offline'}</span></div><div class="check-item"><b>${tr('دوربین','Camera')}</b><span id="cameraStatus">${state.cameraReady?'✓ Ready':'Not checked'}</span></div><div class="check-item"><b>${tr('تمام‌صفحه','Fullscreen')}</b><span>${document.fullscreenEnabled?'✓ Supported':'✕ Unsupported'}</span></div><div class="check-item"><b>${tr('ترجمه مرورگر','Browser translation')}</b><span>${state.translationAssistance?tr('مجاز و اعلام‌شده','Allowed & declared'):tr('استفاده نمی‌شود','Not requested')}</span></div></div><div class="camera-check"><video id="preflightVideo" autoplay muted playsinline></video></div><div class="actions"><button class="btn secondary" id="cameraBtn">${tr('فعال‌کردن دوربین','Enable camera')}</button><button class="btn" id="goBtn" ${state.cameraReady&&navigator.onLine&&document.fullscreenEnabled?'':'disabled'}>${tr('ورود به تمام‌صفحه و شروع','Enter fullscreen and start')}</button><button class="ghost" id="rulesBack">${tr('بازگشت به قوانین','Back to rules')}</button></div><div id="checkMsg"></div></section>`
  const v=document.querySelector('#preflightVideo'); if(state.cameraStream) v.srcObject=state.cameraStream
  document.querySelector('#rulesBack').onclick=rules
  document.querySelector('#cameraBtn').onclick=async()=>{
    try{await startCamera();systemCheck()}catch(e){systemCheck(tr('دوربین فعال نشد: ','Camera could not be enabled: ')+e.message)}
  }
  document.querySelector('#goBtn').onclick=async()=>{
    try{
      if(!state.cameraReady) throw new Error(tr('دوربین باید فعال باشد.','Camera must be enabled.'))
      if(!navigator.onLine) throw new Error(tr('اینترنت قطع است.','Internet connection is offline.'))
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen()
      await startReal()
    }catch(e){document.querySelector('#checkMsg').innerHTML=showError(e.message)}
  }
}

async function startCamera(){
  if(state.cameraStream?.getVideoTracks()?.some(t=>t.readyState==='live')){state.cameraReady=true;return}
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia is not supported by this browser')
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false})
  state.cameraStream=stream;state.cameraReady=true
  for(const track of stream.getVideoTracks()) track.onended=()=>{state.cameraReady=false;logAudit('camera_stopped');showSecurityBanner(tr('دوربین قطع شده است. برای ادامه دوباره آن را فعال کنید.','Camera disconnected. Re-enable it to continue.'))}
  ensureCameraDock()
}
function ensureCameraDock(){
  let dock=document.querySelector('#cameraDock')
  if(!dock){dock=document.createElement('div');dock.id='cameraDock';dock.className='camera-dock';dock.innerHTML=`<div class="camera-label">LIVE • local preview only</div><video autoplay muted playsinline></video>`;document.body.appendChild(dock)}
  const v=dock.querySelector('video');if(state.cameraStream)v.srcObject=state.cameraStream
}
function stopCamera(log=true){
  if(log&&state.cameraReady&&state.attempt&&!state.demo) logAudit('camera_stopped')
  state.cameraStream?.getTracks().forEach(t=>t.stop())
  state.cameraStream=null;state.cameraReady=false
  document.querySelector('#cameraDock')?.remove()
}

async function startReal(){
  try{
    const data=await functionCall('start-exam',{translation_assistance:state.translationAssistance,camera_verified:state.cameraReady})
    loadAttempt(data)
  }catch(e){
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>{})
    if(e.body?.code==='ACTIVE_ATTEMPT'){
      const d=await functionCall('resume-exam');loadAttempt(d)
    }else if(e.body?.code==='COOLDOWN'){
      stopCamera(false);rulesError(tr('امکان شرکت مجدد تا ','Next attempt is available at ')+new Date(e.body.next_attempt_at).toLocaleString())
    }else{stopCamera(false);rulesError(e.message)}
  }
}
function rulesError(m){rules();document.querySelector('#ruleMsg').innerHTML=showError(m)}

function startDemo(){state.demo=true;state.attempt={id:'demo',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+15*60000).toISOString()};state.questions=demoQuestions;state.answers={};state.index=0;renderExam()}
function loadAttempt(data){
  state.demo=false;state.attempt=data.attempt;state.questions=data.questions;state.answers=data.answers||{};state.index=0
  state.translationAssistance=Boolean(data.attempt?.translation_assistance)
  ensureCameraDock();attachAudit();logAudit('camera_started');addWatermark();renderExam()
}
function current(){return state.questions[state.index]}
function selected(q){return (state.answers[q.id]||[]).map(Number)}
async function setAnswer(q,id,checked){
  let a=selected(q);if(q.type==='multiple'){a=checked?[...new Set([...a,id])]:a.filter(x=>x!==id)}else a=[id]
  state.answers[q.id]=a;renderExam(false)
  if(!state.demo)try{await functionCall('save-answer',{attempt_id:state.attempt.id,question_id:q.id,selected_option_ids:a})}catch(e){console.error(e)}
}

function renderExam(resetTop=true){
  clearInterval(state.timer)
  const q=current(),answered=Object.values(state.answers).filter(a=>a.length).length,total=state.questions.length,pct=Math.round(answered/total*100)
  app.innerHTML=`<section class="exam-layout"><article class="card question-card" lang="en" translate="yes"><div class="question-meta" translate="no"><span class="pill">${tr('سؤال','Question')} ${state.index+1}/${total}</span><span class="pill">${esc(q.domain)}</span><span class="pill">${q.type==='multiple'?tr('چندپاسخی','Multiple answer'):tr('تک‌پاسخی','Single answer')}</span>${state.translationAssistance?`<span class="pill translation-pill">${tr('ترجمه مرورگر مجاز','Browser translation allowed')}</span>`:''}</div><div class="question-text english-content" lang="en" translate="yes" dir="ltr">${esc(q.question)}</div><div id="options">${q.options.map(o=>{const is=selected(q).includes(Number(o.id));return `<label class="option ${is?'selected':''}"><input type="${q.type==='multiple'?'checkbox':'radio'}" name="q" data-id="${o.id}" ${is?'checked':''}><span class="english-content" lang="en" translate="yes" dir="ltr">${esc(o.text)}</span></label>`}).join('')}</div><div class="actions" translate="no"><button class="btn secondary" id="prev" ${state.index===0?'disabled':''}>${tr('قبلی','Previous')}</button><button class="btn" id="next">${state.index===total-1?tr('مرور و ثبت','Review and submit'):tr('بعدی','Next')}</button><button class="ghost" id="mark">${state.marked.has(q.id)?tr('حذف علامت','Unmark'):tr('علامت‌گذاری','Mark for review')}</button></div></article><aside class="card sidebar"><div>${tr('زمان باقی‌مانده','Time remaining')}</div><div class="timer" id="timer">--:--</div><div class="progress"><div style="width:${pct}%"></div></div><div>${tr('پاسخ داده‌شده','Answered')}: ${answered}/${total}</div><div class="qgrid">${state.questions.map((x,i)=>`<button class="qdot ${selected(x).length?'answered':''} ${i===state.index?'current':''} ${state.marked.has(x.id)?'marked':''}" data-index="${i}">${i+1}</button>`).join('')}</div></aside></section>`
  markQuestionForBrowserTranslation()
  document.querySelectorAll('#options input').forEach(el=>el.onchange=()=>setAnswer(q,Number(el.dataset.id),el.checked))
  document.querySelector('#prev').onclick=()=>{if(state.index>0){state.index--;renderExam()}}
  document.querySelector('#next').onclick=()=>{if(state.index<total-1){state.index++;renderExam()}else reviewSubmit()}
  document.querySelector('#mark').onclick=()=>{state.marked.has(q.id)?state.marked.delete(q.id):state.marked.add(q.id);renderExam(false)}
  document.querySelectorAll('.qdot').forEach(b=>b.onclick=()=>{state.index=Number(b.dataset.index);renderExam()})
  tick();state.timer=setInterval(tick,1000);if(resetTop)scrollTo(0,0)
}
function tick(){
  const el=document.querySelector('#timer');if(!el)return
  const left=Math.max(0,new Date(state.attempt.expires_at)-Date.now()),m=Math.floor(left/60000),s=Math.floor(left%60000/1000)
  el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  if(left<=0){clearInterval(state.timer);submitExam()}
}
function reviewSubmit(){
  const unanswered=state.questions.length-Object.values(state.answers).filter(a=>a.length).length
  app.innerHTML=`<section class="card"><h1>${tr('مرور نهایی','Final review')}</h1><p class="lead">${tr('سؤال‌های بدون پاسخ: ','Unanswered questions: ')}${unanswered}</p><p>${tr('پس از ثبت، امکان تغییر پاسخ وجود ندارد و نتیجه بلافاصله محاسبه می‌شود.','After submission, answers cannot be changed and the result is calculated immediately.')}</p><div class="actions"><button class="btn danger" id="submit">${tr('ثبت نهایی','Submit assessment')}</button><button class="ghost" id="return">${tr('بازگشت به سؤالات','Return to questions')}</button></div></section>`
  document.querySelector('#return').onclick=renderExam;document.querySelector('#submit').onclick=submitExam
}
async function submitExam(){
  clearInterval(state.timer)
  if(state.demo){
    let score=0,max=0;for(const q of state.questions){const a=selected(q),c=q.correct.map(x=>x+1);max++;if(a.length===c.length&&a.every(x=>c.includes(x)))score++}
    state.result={percentage:Math.round(score/max*100),passed:score/max>=.8,section_scores:{demo:Math.round(score/max*100)},integrity_score:100,integrity_status:'demo'};renderResult();return
  }
  try{const d=await functionCall('submit-exam',{attempt_id:state.attempt.id});state.result=d.attempt;renderResult()}catch(e){app.innerHTML=`<section class="card">${showError(e.message)}<button class="btn" onclick="location.reload()">Reload</button></section>`}
}
function resultDecision(r){
  if(!r.passed)return {label:tr('قبول نشدید','Not passed'),cls:'fail',text:tr('حد نصاب علمی یا حداقل یکی از بخش‌های الزامی کسب نشده است.','The academic pass mark or one of the mandatory section minimums was not met.')}
  if(r.integrity_status==='review')return {label:tr('در انتظار بررسی','Pending review'),cls:'review',text:tr('نمره علمی کافی است، اما رویدادهای یکپارچگی جلسه نیاز به بررسی ادمین دارند.','The academic score passed, but session-integrity events require administrator review.')}
  return {label:tr('قبول شدید','Passed'),cls:'pass',text:tr('نمره کل و حداقل‌های بخش‌ها را کسب کردید.','You met the overall and mandatory section thresholds.')}
}
function renderResult(){
  const r=state.result,p=Number(r.percentage||0),decision=resultDecision(r)
  const started=new Date(r.started_at||state.attempt?.started_at||Date.now()),ended=new Date(r.submitted_at||Date.now()),mins=Math.max(0,Math.round((ended-started)/60000))
  const icon=decision.cls==='pass'?'✓':decision.cls==='review'?'!':'×'
  app.innerHTML=`<section class="card result-card ${decision.cls}" id="resultCard"><div id="celebrationLayer" class="celebration-layer" aria-hidden="true"></div><div class="result-hero"><div class="result-icon ${decision.cls}" aria-hidden="true">${icon}</div><div><div class="pill">${tr('نتیجه نهایی','Final result')}</div><div class="result-score ${decision.cls}" id="animatedScore" data-target="${p}">0%</div><h1 class="result-title">${decision.label}</h1><p class="lead">${decision.text}</p></div></div><div class="result-summary"><div><span>${tr('زمان مصرف‌شده','Time used')}</span><b>${mins} ${tr('دقیقه','min')}</b></div><div><span>${tr('امتیاز یکپارچگی','Integrity score')}</span><b>${Number(r.integrity_score??100)}%</b></div><div><span>${tr('ترجمه مرورگر','Browser translation')}</span><b>${r.translation_assistance?tr('اعلام و مجاز','Declared / allowed'):tr('استفاده نشده','Not declared')}</b></div></div><div class="result-sections">${Object.entries(r.section_scores||{}).map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar"><i data-width="${Number(v)||0}" style="width:0%"></i></div><b>${v}%</b></div>`).join('')}</div><div class="notice">${tr('پاسخ‌های صحیح و کلید سؤال‌ها بعد از آزمون نمایش داده نمی‌شوند.','Correct answers and answer keys are not displayed after the assessment.')}</div><div class="actions"><button class="btn" id="home">${tr('بازگشت به خانه','Return home')}</button></div></section>`
  stopCamera(false);detachAudit();removeWatermark();removeSecurityBanner();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})
  animateResult(decision,p)
  document.querySelector('#home').onclick=()=>{clearExamRuntime();home()}
}
function animateResult(decision,score){
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const scoreEl=document.querySelector('#animatedScore')
  const bars=[...document.querySelectorAll('.result-sections .bar i')]
  if(reduced){if(scoreEl)scoreEl.textContent=`${score}%`;bars.forEach(b=>b.style.width=`${b.dataset.width}%`);return}
  if(scoreEl){
    const start=performance.now(),duration=1100
    const tick=now=>{const t=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-t,3);scoreEl.textContent=`${Math.round(score*ease)}%`;if(t<1)requestAnimationFrame(tick)}
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(()=>bars.forEach((b,i)=>setTimeout(()=>{b.style.width=`${b.dataset.width}%`},220+i*85)))
  const card=document.querySelector('#resultCard');if(card)card.classList.add('result-enter')
  if(decision.cls==='pass')launchConfetti()
  else if(decision.cls==='review')setTimeout(()=>card?.classList.add('review-pulse'),180)
  else setTimeout(()=>card?.classList.add('fail-settle'),180)
}
function launchConfetti(){
  const layer=document.querySelector('#celebrationLayer');if(!layer)return
  const palette=['#4285f4','#34a853','#fbbc05','#ea4335','#8ab4f8','#81c995']
  const count=84
  for(let i=0;i<count;i++){
    const piece=document.createElement('i')
    piece.className='confetti-piece'
    piece.style.setProperty('--x',`${Math.random()*100}%`)
    piece.style.setProperty('--dx',`${(Math.random()-.5)*260}px`)
    piece.style.setProperty('--rot',`${Math.random()*900-450}deg`)
    piece.style.setProperty('--delay',`${Math.random()*.55}s`)
    piece.style.setProperty('--dur',`${2.4+Math.random()*1.8}s`)
    piece.style.setProperty('--c',palette[Math.floor(Math.random()*palette.length)])
    piece.style.setProperty('--w',`${6+Math.random()*7}px`)
    piece.style.setProperty('--h',`${9+Math.random()*10}px`)
    layer.appendChild(piece)
  }
  setTimeout(()=>layer.replaceChildren(),5200)
}

async function logAudit(type,data={}){
  if(state.demo||!state.attempt?.id)return
  return functionCall('log-event',{attempt_id:state.attempt.id,event_type:type,event_data:{at:new Date().toISOString(),...data}}).catch(()=>{})
}
function attachAudit(){
  if(state.demo||state.auditAttached)return
  state.auditAttached=true
  state._vis=()=>logAudit(document.hidden?'tab_hidden':'tab_visible')
  state._blur=()=>logAudit('window_blur')
  state._focus=()=>logAudit('window_focus')
  state._offline=()=>{logAudit('network_offline');showSecurityBanner(tr('اتصال اینترنت قطع شده است.','Internet connection is offline.'))}
  state._online=()=>{logAudit('network_online');removeSecurityBanner()}
  state._fullscreen=()=>{if(document.fullscreenElement){logAudit('fullscreen_enter');removeSecurityBanner()}else{logAudit('fullscreen_exit',{translation_assistance:state.translationAssistance});showSecurityBanner(tr('از حالت تمام‌صفحه خارج شدید. این رویداد ثبت شد.','You exited fullscreen. This event was logged.'),true)}}
  state._copy=e=>{if(!state.attempt)return;e.preventDefault();logAudit('copy_attempt');showSecurityBanner(tr('کپی‌کردن متن آزمون مجاز نیست.','Copying assessment text is not allowed.'),true)}
  state._paste=e=>{if(!state.attempt)return;e.preventDefault();logAudit('paste_attempt');showSecurityBanner(tr('Paste در صفحه آزمون غیرفعال است.','Pasting into the assessment is disabled.'),true)}
  document.addEventListener('visibilitychange',state._vis);window.addEventListener('blur',state._blur);window.addEventListener('focus',state._focus);window.addEventListener('offline',state._offline);window.addEventListener('online',state._online);document.addEventListener('fullscreenchange',state._fullscreen);document.addEventListener('copy',state._copy);document.addEventListener('paste',state._paste)
}
function detachAudit(){
  if(!state.auditAttached)return
  document.removeEventListener('visibilitychange',state._vis);window.removeEventListener('blur',state._blur);window.removeEventListener('focus',state._focus);window.removeEventListener('offline',state._offline);window.removeEventListener('online',state._online);document.removeEventListener('fullscreenchange',state._fullscreen);document.removeEventListener('copy',state._copy);document.removeEventListener('paste',state._paste)
  state.auditAttached=false
}
function showSecurityBanner(text,withButton=false){
  removeSecurityBanner();const el=document.createElement('div');el.id='securityBanner';el.className='security-banner';el.innerHTML=`<span>${esc(text)}</span>${withButton&&document.fullscreenEnabled?`<button id="reenterFullscreen">${tr('بازگشت به تمام‌صفحه','Re-enter fullscreen')}</button>`:''}`;document.body.appendChild(el);if(withButton&&document.querySelector('#reenterFullscreen'))document.querySelector('#reenterFullscreen').onclick=()=>document.documentElement.requestFullscreen().catch(()=>{})
}
function removeSecurityBanner(){document.querySelector('#securityBanner')?.remove()}
function addWatermark(){
  removeWatermark();const el=document.createElement('div');el.id='examWatermark';el.className='exam-watermark';const who=state.session?.user?.email||state.attempt?.id||'candidate';el.textContent=`${who} • ${state.attempt?.id||''}`;document.body.appendChild(el)
}
function removeWatermark(){document.querySelector('#examWatermark')?.remove()}

async function adminPage(message=''){
  app.innerHTML=`<section class="card auth"><div class="pill">Admin</div><h1>${tr('ورود مدیریت','Administrator sign-in')}</h1>${message?showError(message):''}<div class="field"><label>${tr('شناسه ادمین','Admin ID')}</label><input id="adminId" value="GH-ADMIN-01" autocomplete="username"></div><div class="field"><label>${tr('ایمیل ادمین','Admin email')}</label><input id="adminEmail" type="email" autocomplete="email"></div><div class="field"><label>${tr('رمز عبور','Password')}</label><input id="adminPassword" type="password" autocomplete="current-password"></div><div class="actions"><button class="btn" id="adminLogin">${tr('ورود به پنل','Open admin panel')}</button><button class="ghost" id="back">${tr('بازگشت','Back')}</button></div><p class="muted">${tr('شناسه GH-ADMIN-01 به‌تنهایی دسترسی نمی‌دهد؛ حساب ایمیل باید در جدول مدیران مجاز شده باشد.','GH-ADMIN-01 alone does not grant access; the email account must also be authorized in the admin table.')}</p></section>`
  document.querySelector('#back').onclick=home
  document.querySelector('#adminLogin').onclick=adminLogin
}
async function adminLogin(){
  const adminId=document.querySelector('#adminId').value.trim(),email=document.querySelector('#adminEmail').value.trim(),password=document.querySelector('#adminPassword').value
  try{
    const data=await authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})})
    data.expires_at=Math.floor(Date.now()/1000)+data.expires_in;saveSession(data)
    const dash=await functionCall('admin-dashboard',{admin_id:adminId});renderAdmin(dash)
  }catch(e){adminPage(e.message)}
}
async function renderAdmin(data){
  const rows=(data.recent_attempts||[]).map(a=>`<tr><td>${esc(a.email||a.user_id)}</td><td>${new Date(a.started_at).toLocaleString()}</td><td>${a.percentage??'—'}%</td><td>${a.integrity_score??'—'}%</td><td>${esc(a.integrity_status||'—')}</td><td>${a.translation_assistance?'Yes':'No'}</td><td>${esc(a.passed===true?'Passed':a.passed===false?'Not passed':a.status)}</td></tr>`).join('')
  app.innerHTML=`<section><div class="admin-head"><div><div class="pill">${esc(data.admin.admin_id)}</div><h1>${tr('پنل مدیریت آزمون','Assessment admin panel')}</h1></div><button class="ghost" id="adminRefresh">${tr('به‌روزرسانی','Refresh')}</button></div><div class="grid grid-3"><div class="card stat"><strong>${data.metrics.active_questions}</strong><span>Active questions</span></div><div class="card stat"><strong>${data.metrics.submitted_attempts}</strong><span>Submitted attempts</span></div><div class="card stat"><strong>${data.metrics.pending_review}</strong><span>Pending integrity review</span></div></div><div class="card" style="margin-top:20px"><h2>${tr('آخرین نتایج','Recent results')}</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Started</th><th>Score</th><th>Integrity</th><th>Integrity status</th><th>Translation</th><th>Academic status</th></tr></thead><tbody>${rows||`<tr><td colspan="7">No attempts yet.</td></tr>`}</tbody></table></div></div></section>`
  document.querySelector('#adminRefresh').onclick=async()=>{try{renderAdmin(await functionCall('admin-dashboard',{admin_id:data.admin.admin_id}))}catch(e){adminPage(e.message)}}
}

langBtn.onclick=()=>{state.lang=state.lang==='fa'?'en':'fa';localStorage.lang=state.lang;direction();state.questions.length?renderExam(false):home()}
logoutBtn.onclick=()=>{clearExamRuntime();saveSession(null);home()}
adminBtn.onclick=()=>adminPage()
direction();logoutBtn.classList.toggle('hidden',!state.session);home()
