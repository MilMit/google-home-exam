const cfg = window.EXAM_CONFIG || {}
const app = document.querySelector('#app')
const langBtn = document.querySelector('#langBtn')
const logoutBtn = document.querySelector('#logoutBtn')
const state = { lang: localStorage.lang || 'fa', session: JSON.parse(localStorage.session || 'null'), attempt:null, questions:[], answers:{}, index:0, marked:new Set(), result:null, timer:null, demo:false }
const tr = (fa,en)=>state.lang==='fa'?fa:en
const esc = s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))
function direction(){ document.documentElement.lang=state.lang; document.documentElement.dir=state.lang==='fa'?'rtl':'ltr'; langBtn.textContent=state.lang==='fa'?'EN':'فا' }
function saveSession(s){ state.session=s; localStorage.session=JSON.stringify(s); logoutBtn.classList.toggle('hidden',!s) }
function showError(message){ return `<div class="notice error">${esc(message)}</div>` }
async function authFetch(path, options={}){
  const base=cfg.SUPABASE_URL; const key=cfg.SUPABASE_PUBLISHABLE_KEY
  if(!base||!key) throw new Error(tr('پیکربندی Supabase انجام نشده است.','Supabase is not configured.'))
  await refreshIfNeeded()
  const headers={'Content-Type':'application/json','apikey':key,...(options.headers||{})}
  if(state.session?.access_token) headers.Authorization=`Bearer ${state.session.access_token}`
  const res=await fetch(`${base}${path}`,{...options,headers}); const body=await res.json().catch(()=>({}))
  if(!res.ok) throw Object.assign(new Error(body.error||body.msg||body.message||`HTTP ${res.status}`),{status:res.status,body})
  return body
}
async function refreshIfNeeded(){
  if(!state.session?.refresh_token) return
  const exp=(state.session.expires_at||0)*1000
  if(Date.now()<exp-120000) return
  const res=await fetch(`${cfg.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({refresh_token:state.session.refresh_token})})
  if(!res.ok){saveSession(null);return} const s=await res.json(); s.expires_at=Math.floor(Date.now()/1000)+s.expires_in; saveSession(s)
}
async function functionCall(name,payload={}){ return authFetch(`/functions/v1/${name}`,{method:'POST',body:JSON.stringify(payload)}) }

const demoQuestions=[
 {id:1,domain:'products',type:'single',question:'[Demo] Which Google product is a smart display?',options:['Nest Hub','Nest Audio','Nest Wifi Pro','Nest Cam'],correct:[0]},
 {id:2,domain:'network',type:'single',question:'[Demo] What does a Thread Border Router do?',options:['Connects the Thread network to the home IP network','Improves HDMI quality','Stores video','Charges batteries'],correct:[0]},
 {id:3,domain:'appliances',type:'multiple',question:'[Demo] Which conditions are commonly needed for washer Remote Start?',options:['Door closed','Remote Start armed','Eligible cycle','HDMI cable'],correct:[0,1,2]},
 {id:4,domain:'security',type:'single',question:'[Demo] What is the best household-member practice?',options:['Least-privilege access per person','One shared account for all','Disable 2FA','Publish the password'],correct:[0]},
 {id:5,domain:'automation',type:'single',question:'[Demo] What is a key principle for heating-appliance automation?',options:['Fail-safe design','Unattended activation','Remove manufacturer limits','Ignore errors'],correct:[0]},
 {id:6,domain:'troubleshooting',type:'single',question:'[Demo] If a device is online in its manufacturer app but offline in Google Home, what should be checked?',options:['Account link and cloud service','TV cable','Device colour','Speaker volume'],correct:[0]}
].map(q=>({...q,options:q.options.map((text,i)=>({id:i+1,text}))}))

function home(){
 app.innerHTML=`<section class="hero"><div><div class="pill">${tr('ارزیابی حرفه‌ای با سؤالات انگلیسی','Professional assessment with English-only questions')}</div><h1>${tr('آزمون سختِ خانه هوشمند Google','Advanced Google Smart Home Assessment')}</h1><p class="lead">${tr('۶۰ سؤال سناریویی انگلیسی از بانک ۲۴۰ سؤالی، ۷۵ دقیقه زمان، نمره قبولی ۸۰٪ و حداقل نمره مستقل در امنیت، شبکه و محصولات. پاسخ‌ها فقط در سرور بررسی می‌شوند.','60 English-only scenario-based questions drawn from a 240-question bank, 75 minutes, an 80% pass mark, and independent minimum scores in security, networking, and products. Answers are graded only on the server.')}</p><div class="actions"><button class="btn" id="beginBtn">${tr('ورود و شروع','Sign in and begin')}</button><button class="btn secondary" id="demoBtn">${tr('پیش‌نمایش نمونه','Open demo preview')}</button></div>${cfg.DEMO_MODE?`<div class="notice">${tr('سایت فعلاً در حالت پیش‌نمایش است. برای آزمون واقعی، Supabase را طبق README متصل کنید.','The site is currently in preview mode. Connect Supabase using the README for the real assessment.')}</div>`:''}</div><div class="hero-art"><img src="assets/nest-audio.png"><img src="assets/nest-hub.png"><img src="assets/nest-cam.png"><img src="assets/google-tv-streamer.png"></div></section><section class="grid grid-3" style="margin-top:38px"><div class="card stat"><strong>240</strong><span>${tr('سؤال در بانک خصوصی','questions in the private bank')}</span></div><div class="card stat"><strong>60</strong><span>${tr('هدف یادگیری در هر نوبت','learning objectives per attempt')}</span></div><div class="card stat"><strong>75</strong><span>${tr('دقیقه زمان','minutes')}</span></div></section>`
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
 app.innerHTML=`<section class="card rules"><h1>${tr('قوانین آزمون','Assessment rules')}</h1><ul><li>${tr('متن تمام سؤال‌ها و گزینه‌ها فقط انگلیسی است.','All question and option text is in English only.')}</li><li>${tr('۶۰ سؤال در ۷۵ دقیقه؛ هر هدف آموزشی یک‌بار با یکی از چهار صورت سؤال ظاهر می‌شود.','60 questions in 75 minutes; each learning objective appears once in one of four variants.')}</li><li>${tr('سؤالات چندپاسخی نمره جزئی دارند، اما انتخاب گزینه غلط امتیاز آن سؤال را صفر می‌کند.','Multiple-answer questions award partial credit, but selecting a wrong option gives zero for that question.')}</li><li>${tr('حد قبولی کل ۸۰٪ است؛ امنیت حداقل ۷۰٪ و شبکه و محصولات هرکدام حداقل ۶۰٪.','Overall pass mark is 80%; security requires 70%, and networking and products each require 60%.')}</li><li>${tr('تغییر تب و خروج از صفحه ثبت می‌شود.','Tab changes and focus events are logged.')}</li><li>${tr('پس از پایان، جواب‌های صحیح نمایش داده نمی‌شوند.','Correct answers are not revealed after submission.')}</li></ul><label class="option"><input type="checkbox" id="agree"><span>${tr('قوانین را خواندم و آماده‌ام.','I have read the rules and I am ready.')}</span></label><div class="actions"><button class="btn" id="start">${tr('شروع آزمون','Start assessment')}</button><button class="ghost" id="back">${tr('بازگشت','Back')}</button></div><div id="ruleMsg"></div></section>`
 document.querySelector('#back').onclick=home;document.querySelector('#start').onclick=async()=>{if(!document.querySelector('#agree').checked){document.querySelector('#ruleMsg').innerHTML=showError(tr('ابتدا قوانین را تأیید کنید.','Please accept the rules first.'));return} await startReal()}
}
async function startReal(){
 try{ const data=await functionCall('start-exam');loadAttempt(data) }catch(e){ if(e.body?.code==='ACTIVE_ATTEMPT'){const d=await functionCall('resume-exam');loadAttempt(d)}else if(e.body?.code==='COOLDOWN') rulesError(tr('امکان شرکت مجدد تا ','Next attempt is available at ')+new Date(e.body.next_attempt_at).toLocaleString()); else rulesError(e.message) }
}
function rulesError(m){rules();document.querySelector('#ruleMsg').innerHTML=showError(m)}
function startDemo(){ state.demo=true;state.attempt={id:'demo',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+15*60000).toISOString()};state.questions=demoQuestions;state.answers={};state.index=0;renderExam() }
function loadAttempt(data){state.demo=false;state.attempt=data.attempt;state.questions=data.questions;state.answers=data.answers||{};state.index=0;attachAudit();renderExam()}
function current(){return state.questions[state.index]}
function selected(q){return (state.answers[q.id]||[]).map(Number)}
async function setAnswer(q,id,checked){let a=selected(q);if(q.type==='multiple'){a=checked?[...new Set([...a,id])]:a.filter(x=>x!==id)}else a=[id];state.answers[q.id]=a;renderExam(false);if(!state.demo)try{await functionCall('save-answer',{attempt_id:state.attempt.id,question_id:q.id,selected_option_ids:a})}catch(e){console.error(e)}}
function renderExam(resetTop=true){clearInterval(state.timer);const q=current(),answered=Object.values(state.answers).filter(a=>a.length).length,total=state.questions.length,pct=Math.round(answered/total*100)
 app.innerHTML=`<section class="exam-layout"><article class="card question-card"><div class="question-meta"><span class="pill">${tr('سؤال','Question')} ${state.index+1}/${total}</span><span class="pill">${esc(q.domain)}</span><span class="pill">${q.type==='multiple'?tr('چندپاسخی','Multiple answer'):tr('تک‌پاسخی','Single answer')}</span></div><div class="question-text english-content" dir="ltr">${esc(q.question)}</div><div id="options">${q.options.map(o=>{const is=selected(q).includes(Number(o.id));return `<label class="option ${is?'selected':''}"><input type="${q.type==='multiple'?'checkbox':'radio'}" name="q" data-id="${o.id}" ${is?'checked':''}><span class="english-content" dir="ltr">${esc(o.text)}</span></label>`}).join('')}</div><div class="actions"><button class="btn secondary" id="prev" ${state.index===0?'disabled':''}>${tr('قبلی','Previous')}</button><button class="btn" id="next">${state.index===total-1?tr('مرور و ثبت','Review and submit'):tr('بعدی','Next')}</button><button class="ghost" id="mark">${state.marked.has(q.id)?tr('حذف علامت','Unmark'):tr('علامت‌گذاری','Mark for review')}</button></div></article><aside class="card sidebar"><div>${tr('زمان باقی‌مانده','Time remaining')}</div><div class="timer" id="timer">--:--</div><div class="progress"><div style="width:${pct}%"></div></div><div>${tr('پاسخ داده‌شده','Answered')}: ${answered}/${total}</div><div class="qgrid">${state.questions.map((x,i)=>`<button class="qdot ${selected(x).length?'answered':''} ${i===state.index?'current':''} ${state.marked.has(x.id)?'marked':''}" data-index="${i}">${i+1}</button>`).join('')}</div></aside></section>`
 document.querySelectorAll('#options input').forEach(el=>el.onchange=()=>setAnswer(q,Number(el.dataset.id),el.checked));document.querySelector('#prev').onclick=()=>{if(state.index>0){state.index--;renderExam()}};document.querySelector('#next').onclick=()=>{if(state.index<total-1){state.index++;renderExam()}else reviewSubmit()};document.querySelector('#mark').onclick=()=>{state.marked.has(q.id)?state.marked.delete(q.id):state.marked.add(q.id);renderExam(false)};document.querySelectorAll('.qdot').forEach(b=>b.onclick=()=>{state.index=Number(b.dataset.index);renderExam()});tick();state.timer=setInterval(tick,1000);if(resetTop)scrollTo(0,0)
}
function tick(){const el=document.querySelector('#timer');if(!el)return;const left=Math.max(0,new Date(state.attempt.expires_at)-Date.now());const m=Math.floor(left/60000),s=Math.floor(left%60000/1000);el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(left<=0){clearInterval(state.timer);submitExam()}}
function reviewSubmit(){const unanswered=state.questions.length-Object.values(state.answers).filter(a=>a.length).length;app.innerHTML=`<section class="card"><h1>${tr('مرور نهایی','Final review')}</h1><p class="lead">${tr('سؤال‌های بدون پاسخ: ','Unanswered questions: ')}${unanswered}</p><p>${tr('پس از ثبت، امکان تغییر پاسخ وجود ندارد.','After submission, answers cannot be changed.')}</p><div class="actions"><button class="btn danger" id="submit">${tr('ثبت نهایی','Submit assessment')}</button><button class="ghost" id="return">${tr('بازگشت به سؤالات','Return to questions')}</button></div></section>`;document.querySelector('#return').onclick=renderExam;document.querySelector('#submit').onclick=submitExam}
async function submitExam(){clearInterval(state.timer);if(state.demo){let score=0,max=0;for(const q of state.questions){const a=selected(q),c=q.correct.map(x=>x+1);max++;if(a.length===c.length&&a.every(x=>c.includes(x)))score++}state.result={percentage:Math.round(score/max*100),passed:score/max>=.8,section_scores:{demo:Math.round(score/max*100)}};renderResult();return}try{const d=await functionCall('submit-exam',{attempt_id:state.attempt.id});state.result=d.attempt;renderResult()}catch(e){app.innerHTML=`<section class="card">${showError(e.message)}<button class="btn" onclick="location.reload()">Reload</button></section>`}}
function renderResult(){const r=state.result,p=Number(r.percentage||0);app.innerHTML=`<section class="card"><div class="pill">${tr('نتیجه نهایی','Final result')}</div><div class="result-score ${r.passed?'pass':'fail'}">${p}%</div><h1>${r.passed?tr('قبول شدید','Passed'):tr('قبول نشدید','Not passed')}</h1><p class="lead">${r.passed?tr('نمره کل و حداقل‌های بخش‌ها را کسب کردید.','You met the overall and section thresholds.'):tr('برای قبولی باید هم نمره کل و هم حداقل بخش‌های الزامی را کسب کنید.','Passing requires both the overall score and mandatory section minimums.')}</p>${Object.entries(r.section_scores||{}).map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}%</b></div>`).join('')}<div class="actions"><button class="btn" id="home">${tr('بازگشت به خانه','Return home')}</button></div></section>`;document.querySelector('#home').onclick=home}
function attachAudit(){if(state.demo)return;const log=t=>functionCall('log-event',{attempt_id:state.attempt.id,event_type:t,event_data:{at:new Date().toISOString()}}).catch(()=>{});document.onvisibilitychange=()=>log(document.hidden?'tab_hidden':'tab_visible');window.onblur=()=>log('window_blur');window.onfocus=()=>log('window_focus');window.onoffline=()=>log('network_offline');window.ononline=()=>log('network_online')}
langBtn.onclick=()=>{state.lang=state.lang==='fa'?'en':'fa';localStorage.lang=state.lang;direction();state.questions.length?renderExam(false):home()};logoutBtn.onclick=()=>{saveSession(null);home()};direction();logoutBtn.classList.toggle('hidden',!state.session);home()
