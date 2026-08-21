import { authenticatedUser, handleOptions, json } from '../_shared/common.ts'
Deno.serve(async(req)=>{
  const preflight=handleOptions(req); if(preflight) return preflight
  try{
    const {user,admin}=await authenticatedUser(req); const {attempt_id,event_type,event_data={}}=await req.json()
    const allowed=['tab_hidden','tab_visible','window_blur','window_focus','network_offline','network_online','camera_started','camera_stopped','fullscreen_enter','fullscreen_exit','copy_attempt','paste_attempt']
    if(!allowed.includes(event_type)) throw new Error('Invalid event')
    const {data:a}=await admin.from('exam_attempts').select('id').eq('id',attempt_id).eq('user_id',user.id).eq('status','active').maybeSingle(); if(!a) throw new Error('Active attempt not found')
    await admin.from('attempt_events').insert({attempt_id,user_id:user.id,event_type,event_data})
    return json({ok:true})
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
})
