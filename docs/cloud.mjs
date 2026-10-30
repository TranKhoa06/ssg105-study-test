import { createClient } from './vendor/supabase.mjs';
import { supabaseUrl,supabasePublishableKey } from './config.mjs';

export const configured=!!supabaseUrl&&!!supabasePublishableKey;
const db=configured?createClient(supabaseUrl,supabasePublishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
let user=null,member=null,revision=0,signingOut=false,beforeSignOut=async()=>{};
const imageUrls=new Set();
function checked(result){if(result.error)throw result.error;return result.data;}
function gate(message){
  document.getElementById('auth-gate').hidden=false;
  document.getElementById('protected-workspace').hidden=true;
  document.getElementById('auth-message').textContent=message;
  document.getElementById('backup-button').hidden=true;
}
export async function authorize(){
  const login=document.getElementById('google-login'),logout=document.getElementById('sign-out');
  login.disabled=!configured;
  login.addEventListener('click',async()=>{
    login.disabled=true;
    try{
      checked(await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}${location.pathname}`}}));
    }catch(error){document.getElementById('auth-message').textContent=`Chưa đăng nhập được: ${error.message}`;login.disabled=false;}
  });
  logout.addEventListener('click',async()=>{
    try{await beforeSignOut();}catch{if(!confirm('Tiến trình chưa đồng bộ được. Đăng xuất ngay? Hãy xuất sao lưu nếu cần giữ lại.'))return;}
    signingOut=true;
    try{if(db)checked(await db.auth.signOut());}catch{}
    finally{for(const url of imageUrls)URL.revokeObjectURL(url);imageUrls.clear();location.reload();}
  });
  if(!configured){gate('Website đang được cấu hình đăng nhập. Bộ ảnh SSG chưa được đưa lên GitHub công khai.');return null;}
  const {data:{session},error}=await db.auth.getSession();if(error)throw error;
  if(!session){gate('Đăng nhập để vào bộ SSG của nhóm. Chỉ thành viên được duyệt mới đọc được câu hỏi và ảnh.');return null;}
  user=checked(await db.auth.getUser()).user;
  if(!user){gate('Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');return null;}
  logout.hidden=false;
  member=checked(await db.from('ssg_members').select('user_id,role,status').eq('user_id',user.id).maybeSingle());
  if(!member||member.status!=='active'){
    gate(member?.status==='blocked'?'Tài khoản này chưa có quyền truy cập bộ học.':'Bạn đã đăng nhập. Chủ nhóm cần duyệt tài khoản trước khi bạn vào học.');login.hidden=true;return null;
  }
  db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'&&!signingOut){gate('Phiên đăng nhập đã kết thúc.');for(const url of imageUrls)URL.revokeObjectURL(url);imageUrls.clear();location.reload();}});
  document.getElementById('auth-gate').hidden=true;
  document.getElementById('protected-workspace').hidden=false;
  document.getElementById('backup-button').hidden=false;
  document.getElementById('account-label').textContent=user.email||'Thành viên SSG';
  return {id:user.id,role:member.role};
}
export function setBeforeSignOut(callback){beforeSignOut=callback;}
export async function loadBank(){
  const rows=checked(await db.from('ssg_questions').select('id,data').eq('published',true).order('id'));
  return {questions:rows.map(row=>({...row.data,id:row.id}))};
}
export async function readProgress(){
  const row=checked(await db.from('ssg_progress').select('data,revision').eq('user_id',user.id).maybeSingle());
  revision=row?.revision||0;return row?.data||null;
}
export async function writeProgress(data){
  const result=checked(await db.rpc('ssg_save_progress',{p_data:data,p_expected_revision:revision}));
  revision=Number(result);return revision;
}
export async function sourceImage(path){
  if(!/^assets\/(?:questions|answers)\/[1-9]\d*\.jpg$/.test(path))throw new Error('Đường dẫn ảnh không hợp lệ.');
  const blob=checked(await db.storage.from('ssg105-private').download(path));
  const url=URL.createObjectURL(blob);imageUrls.add(url);return url;
}
export function releaseImage(url){if(imageUrls.delete(url))URL.revokeObjectURL(url);}
