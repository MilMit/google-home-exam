import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
Deno.serve(async(req)=>{
  const preflight=handleOptions(req);if(preflight)return preflight
  try{
    const {user,admin}=await authenticatedUser(req);const {admin_id}=await req.json()
    const {data:adminRow}=await admin.from('admin_users').select('admin_id,display_name,is_active').eq('user_id',user.id).eq('admin_id',admin_id).eq('is_active',true).maybeSingle()
    if(!adminRow)return json({error:'Administrator access denied'},403)
    const [{count:activeQuestions},{count:submittedAttempts},{count:pendingReview},{data:recent}]=await Promise.all([
      admin.from('questions').select('*',{count:'exact',head:true}).eq('is_active',true),
      admin.from('exam_attempts').select('*',{count:'exact',head:true}).eq('status','submitted'),
      admin.from('exam_attempts').select('*',{count:'exact',head:true}).eq('integrity_status','review'),
      admin.from('exam_attempts').select('id,user_id,started_at,submitted_at,status,percentage,passed,section_scores,integrity_score,integrity_status,translation_assistance,security_summary').order('started_at',{ascending:false}).limit(50)
    ])
    const {data:userList}=await admin.auth.admin.listUsers({page:1,perPage:1000})
    const emails=new Map((userList?.users??[]).map(u=>[u.id,u.email??u.id]))
    const attempts=(recent??[]).map(a=>({...a,email:emails.get(a.user_id)??a.user_id}))
    return json({admin:adminRow,metrics:{active_questions:activeQuestions??0,submitted_attempts:submittedAttempts??0,pending_review:pendingReview??0},recent_attempts:attempts})
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
})
