import { grade, statistics, shuffled, sanitizeProgress } from './logic.mjs';
import {authorize,loadBank,readProgress,writeProgress,sourceImage,releaseImage,setBeforeSignOut} from './cloud.mjs';

let STORAGE='';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let questions=[],byId=new Map(),progress,search='',filter='all',toastTimer;
let pendingSave=null,syncing=null,syncError=null,syncTimer,currentImage=null;
const modeNames={practice:'Luyện từng câu',exam:'Làm bài kiểm tra',wrong:'Ôn câu còn sai',saved:'Câu đã lưu'};
const fresh=()=>({version:1,subject:'SSG105',attempts:[],bookmarks:[],session:null});

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500)}
function save(){
  try{localStorage.setItem(STORAGE,JSON.stringify(progress))}catch{}
  pendingSave=structuredClone(progress);$('sync-status').textContent='Đang lưu tiến trình…';
  clearTimeout(syncTimer);syncTimer=setTimeout(()=>void flushSave().catch(()=>{}),300);
}
async function flushSave(){
  clearTimeout(syncTimer);
  if(syncError)throw syncError;
  if(syncing){await syncing;if(pendingSave)return flushSave();return;}
  syncing=(async()=>{while(pendingSave){const next=pendingSave;pendingSave=null;try{await writeProgress(next);}catch(error){pendingSave??=next;syncError=error;$('sync-status').textContent='Chưa lưu online. Hãy xuất sao lưu trước khi tải lại.';toast(`Chưa đồng bộ: ${error.message}`);throw error;}}$('sync-status').textContent='Đã lưu online.';})();
  try{await syncing;}finally{syncing=null;}
}
setBeforeSignOut(flushSave);
addEventListener('beforeunload',event=>{if(pendingSave||syncing){event.preventDefault();event.returnValue='';}});
function stats(){return statistics(questions,progress.attempts)}
function reviveSession(value){
  if(!value||!Object.hasOwn(modeNames,value.mode)||!Array.isArray(value.ids))return null;
  const ids=[...new Set(value.ids.filter(id=>byId.has(id)))];
  const answers={};
  for(const id of ids){const selected=value.answers?.[id];if(Array.isArray(selected)&&selected.every(choice=>byId.get(id).choices.some(c=>c.id===choice)))answers[id]=[...new Set(selected)]}
  return {mode:value.mode,ids,index:Math.min(Math.max(0,Number.isInteger(value.index)?value.index:0),Math.max(0,ids.length-1)),answers,
    revealed:Array.isArray(value.revealed)?value.revealed.filter(id=>ids.includes(id)):[],submitted:value.submitted===true,startedAt:value.startedAt||new Date().toISOString()};
}
function filtered(mode){
  const current=stats(),saved=new Set(progress.bookmarks);
  return questions.filter(q=>{
    if(mode==='wrong'&&!current.wrongIds.includes(q.id))return false;
    if(mode==='saved'&&!saved.has(q.id))return false;
    if(filter==='unanswered'&&current.latest.has(q.id))return false;
    if(filter==='review'&&!q.needsReview)return false;
    if(search){const needle=search.toLocaleLowerCase('vi');return String(q.id)===needle||`${q.prompt} ${q.choices.map(c=>c.text).join(' ')}`.toLocaleLowerCase('vi').includes(needle)}
    return true;
  });
}
function newSession(mode,ids){return {mode,ids,index:0,answers:{},revealed:[],submitted:false,startedAt:new Date().toISOString()}}
function canLeave(){const s=progress.session;return !(s?.mode==='exam'&&s.ids.length&&!s.submitted)||confirm('Bài kiểm tra chưa nộp. Rời bài sẽ bỏ các lựa chọn trong bài này. Tiếp tục?')}
function setMode(mode){
  if(!canLeave())return;
  search='';filter='all';$('search').value='';$('status-filter').value='all';
  progress.session=newSession(mode,mode==='exam'?[]:filtered(mode).map(q=>q.id));save();render();
}
function rebuildQueue(){
  const s=progress.session;if(s.mode==='exam')return;
  const previous=s.ids[s.index];s.ids=filtered(s.mode).map(q=>q.id);s.index=Math.max(0,s.ids.indexOf(previous));save();render();
}
function record(question,selected){const correct=grade(question,selected);if(correct===null)return;progress.attempts.push({questionId:question.id,selected:[...selected],correct,at:new Date().toISOString()})}
function render(){
  const s=progress.session,current=stats(),exam=s.mode==='exam',activeExam=exam&&s.ids.length>0&&!s.submitted;
  document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===s.mode);button.setAttribute('aria-current',button.dataset.mode===s.mode?'page':'false')});
  $('answered-stat').innerHTML=`${current.answered}<span>/${questions.length}</span>`;
  $('correct-stat').textContent=current.firstCorrect;$('review-stat').textContent=current.wrongIds.length;
  $('wrong-count').textContent=current.wrongIds.length;$('saved-count').textContent=progress.bookmarks.length;
  $('mode-heading').textContent=modeNames[s.mode];$('mode-eyebrow').textContent=exam?'TỰ KIỂM TRA KIẾN THỨC':s.mode==='wrong'?'HIỂU LẠI, NHỚ LÂU HƠN':'TỪNG BƯỚC MỘT';
  $('exam-controls').hidden=!exam;$('start-exam').textContent=activeExam?'Bắt đầu bài khác ↗':'Bắt đầu bài mới ↗';
  $('search').disabled=!!activeExam;$('status-filter').disabled=!!activeExam;
  $('shuffle-button').disabled=exam;$('exam-length').disabled=false;
  $('exam-summary').hidden=!(exam&&s.submitted);
  if(exam&&s.submitted){const score=s.ids.filter(id=>grade(byId.get(id),s.answers[id]||[])===true).length;const total=s.ids.filter(id=>byId.get(id).gradeable).length;const skipped=s.ids.filter(id=>!s.answers[id]?.length).length;
    $('exam-summary').innerHTML=`<h3>${score} / ${total} câu đúng</h3><p>${skipped?`${skipped} câu chưa chọn được tính là chưa đúng. `:''}Bạn có thể xem từng lời giải bên dưới. Kết quả chấm theo ảnh đáp án nguồn.</p>`;}
  $('queue-label').textContent=s.ids.length?`Câu ${s.index+1} / ${s.ids.length}`:'Chưa có câu trong phiên';
  $('queue-progress').style.width=s.ids.length?`${100*(s.index+1)/s.ids.length}%`:'0%';
  $('session-indicator').textContent=exam&&s.ids.length?`${s.ids.filter(id=>s.answers[id]?.length).length} đã chọn`:'';
  const q=byId.get(s.ids[s.index]);
  if(!q){$('question-host').innerHTML=`<div class="empty-state"><span class="empty-symbol">${exam?'◷':s.mode==='wrong'?'✓':'◇'}</span><h3>${exam?'Dành một lượt để tự kiểm tra.':s.mode==='wrong'?'Chưa có câu sai cần ôn.':s.mode==='saved'?'Giữ lại những câu bạn muốn nhớ.':'Chưa tìm thấy câu phù hợp.'}</h3><p>${exam?'Chọn số câu ở trên rồi bắt đầu bài.':s.mode==='saved'?'Bấm biểu tượng đánh dấu bên cạnh câu hỏi để lưu vào đây.':'Bạn có thể quay lại luyện tập hoặc đổi bộ lọc.'}</p>${!exam?'<button class="button primary" data-action="all">Về luyện từng câu ↗</button>':''}</div>`;$('jump-host').innerHTML='';return;}
  const selected=s.answers[q.id]||[],revealed=exam?s.submitted:s.revealed.includes(q.id),result=revealed?grade(q,selected):null,saved=progress.bookmarks.includes(q.id),multiple=q.correct.length>1;
  $('question-host').innerHTML=`<article class="question-card"><div class="question-meta"><span class="question-number">SSG105 / CÂU ${String(q.id).padStart(3,'0')}</span><span class="question-kind">${multiple?'Chọn nhiều':q.gradeable?'Chọn một':'Cần đối chiếu'}</span><button class="icon-button ${saved?'saved':''}" data-action="bookmark" aria-label="${saved?'Bỏ lưu câu hỏi':'Lưu câu hỏi'}" aria-pressed="${saved}">${saved?'◆':'◇'}</button></div>
    <h3 class="question-prompt">${escape(q.prompt||'Xem nội dung câu hỏi trong ảnh gốc.')}</h3>
    <p class="question-caption">${multiple?'Chọn các phương án phù hợp.':'Chọn một phương án.'}${q.needsReview?' Chưa có đáp án nguồn để chấm điểm.':''}</p>
    <div class="choices" role="group" aria-label="Các phương án trả lời">${q.choices.map(c=>{const checked=selected.includes(c.id),right=revealed&&q.correct.includes(c.id),wrong=revealed&&checked&&!q.correct.includes(c.id);return `<button class="choice ${checked?'selected':''} ${right?'correct':''} ${wrong?'wrong':''}" data-choice="${escape(c.id)}" aria-pressed="${checked}" ${revealed?'disabled':''}><span class="choice-letter">${escape(c.id)}</span><span>${escape(c.text)}</span>${right?'<span class="choice-symbol">✓</span>':wrong?'<span class="choice-symbol">×</span>':checked?'<span class="choice-symbol">●</span>':''}</button>`}).join('')}</div>
    <div class="question-actions">${exam?(!s.submitted?`<button class="button primary exam-submit" data-action="submit-exam">Nộp bài <span>↗</span></button>`:''):
      revealed?`<button class="button secondary" data-action="retry">↺ Làm lại câu này</button>`:
      `<button class="button primary" data-action="check" ${!selected.length&&q.gradeable?'disabled':''}>${q.gradeable?'Kiểm tra đáp án':'Xem đáp án nguồn'} <span>↗</span></button>`}
      <button class="button ghost" data-action="question-image">▧ Xem ảnh đề gốc</button></div>
    ${revealed?`<div class="feedback ${result===false?'wrong':result===null?'neutral':''}" role="status">${result===true?'✓ Đúng theo đáp án nguồn.':result===false?selected.length?'Chưa đúng. Cùng đọc lại lời giải nhé.':'Bạn chưa chọn đáp án cho câu này.':'Câu chưa đủ dữ liệu để chấm tự động. Xem ảnh đáp án để đối chiếu.'}</div><section class="solution"><h3>ĐÁP ÁN & LỜI GIẢI</h3><p class="answer-line">${q.correct.map(id=>`${escape(id)}. ${escape(q.choices.find(c=>c.id===id)?.text||'')}`).join('<br>')||'Chưa nhận dạng chắc chắn đáp án.'}</p><p class="solution-text">${escape(q.explanation||'Xem lời giải trong ảnh đáp án gốc.')}</p><div class="solution-tools"><button class="button ghost" data-action="answer-image">▧ Đối chiếu ảnh đáp án</button><button class="button ghost" data-action="question-image">▧ Xem ảnh đề</button></div></section>`:''}
    <div class="navigation"><button class="button secondary" data-action="previous" ${s.index===0?'disabled':''}>← Câu trước</button><span>${s.index+1} / ${s.ids.length}</span><button class="button primary" data-action="next" ${s.index===s.ids.length-1?'disabled':''}>Câu tiếp →</button></div></article>`;
  $('jump-host').innerHTML=`<details class="jump-details"><summary>Chọn nhanh câu hỏi <span>(${s.ids.length} câu)</span></summary><div class="jump-grid">${s.ids.map((id,index)=>{const a=exam?(s.submitted?{correct:grade(byId.get(id),s.answers[id]||[])}:null):current.latest.get(id);return `<button data-jump="${index}" class="${index===s.index?'current':''} ${a?a.correct?'correct':'wrong':s.answers[id]?.length?'answered':''}" aria-label="Đến câu ${id}" ${index===s.index?'aria-current="true"':''}>${id}</button>`}).join('')}</div></details>`;
}

document.addEventListener('click',event=>{
  const element=event.target.closest('button');if(!element||!progress)return;
  if(element.dataset.mode){setMode(element.dataset.mode);return;}
  const s=progress.session,q=byId.get(s.ids[s.index]);
  if(element.dataset.choice){
    if(!q||(s.mode==='exam'?s.submitted:s.revealed.includes(q.id)))return;
    const id=element.dataset.choice,selected=s.answers[q.id]||[];
    s.answers[q.id]=q.correct.length>1?(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]):[id];save();render();return;
  }
  if(element.dataset.jump!==undefined){s.index=Number(element.dataset.jump);save();render();return;}
  switch(element.dataset.action){
    case 'all':setMode('practice');break;
    case 'bookmark':if(q){progress.bookmarks=progress.bookmarks.includes(q.id)?progress.bookmarks.filter(id=>id!==q.id):[...progress.bookmarks,q.id];save();render();}break;
    case 'check':if(q&&!s.revealed.includes(q.id)){record(q,s.answers[q.id]||[]);s.revealed.push(q.id);save();render();}break;
    case 'retry':if(q){s.revealed=s.revealed.filter(id=>id!==q.id);s.answers[q.id]=[];save();render();}break;
    case 'next':s.index=Math.min(s.index+1,s.ids.length-1);save();render();break;
    case 'previous':s.index=Math.max(0,s.index-1);save();render();break;
    case 'question-image':if(q)openImage(q.questionImage,`Ảnh đề · câu ${q.id}`);break;
    case 'answer-image':if(q&&(s.mode==='exam'?s.submitted:s.revealed.includes(q.id)))openImage(q.answerImage,`Ảnh đáp án · câu ${q.id}`);break;
    case 'submit-exam':submitExam();break;
  }
});
async function openImage(path,title){
  try{const url=await sourceImage(path);if(currentImage)releaseImage(currentImage);currentImage=url;$('image-title').textContent=title;$('dialog-image').src=url;$('dialog-image').alt=title;$('image-dialog').showModal();}
  catch(error){toast(`Chưa tải được ảnh: ${error.message}`);}
}
function submitExam(){const s=progress.session;if(s.mode!=='exam'||s.submitted||!s.ids.length)return;const remaining=s.ids.filter(id=>!s.answers[id]?.length).length;if(!confirm(remaining?`Còn ${remaining} câu chưa chọn. Nộp bài ngay?`:'Nộp bài và xem kết quả?'))return;
  for(const id of s.ids)record(byId.get(id),s.answers[id]||[]);s.submitted=true;s.submittedAt=new Date().toISOString();save();render();$('exam-summary').scrollIntoView({behavior:'smooth',block:'center'});
}
$('search').addEventListener('input',event=>{search=event.target.value.trim();rebuildQueue()});
$('status-filter').addEventListener('change',event=>{filter=event.target.value;rebuildQueue()});
$('shuffle-button').addEventListener('click',()=>{const s=progress.session;if(s.mode==='exam')return;s.ids=shuffled(filtered(s.mode).map(q=>q.id));s.index=0;save();render();toast('Đã trộn thứ tự câu. Phương án giữ thứ tự gốc.')});
$('ssg-subject').addEventListener('click',()=>setMode('practice'));
$('start-exam').addEventListener('click',()=>{if(!canLeave())return;const available=filtered('exam').filter(q=>q.gradeable);if(!available.length){toast('Chưa có câu đủ dữ liệu trong bộ lọc này.');return;}const limit=Number($('exam-length').value);progress.session=newSession('exam',shuffled(available.map(q=>q.id)).slice(0,limit));save();render()});
$('close-image').addEventListener('click',()=>$('image-dialog').close());
$('image-dialog').addEventListener('close',()=>{if(currentImage)releaseImage(currentImage);currentImage=null;$('dialog-image').removeAttribute('src');});
$('backup-button').addEventListener('click',()=>$('backup-dialog').showModal());
$('close-backup').addEventListener('click',()=>$('backup-dialog').close());
for(const id of ['image-dialog','backup-dialog'])$(id).addEventListener('click',event=>{if(event.target===$(id)){const box=$(id).getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)$(id).close()}});
$('export-progress').addEventListener('click',()=>{const value={...progress,exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`ssg105-tien-trinh-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Đã xuất tiến trình SSG105.')});
$('import-progress').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>10000000)throw new Error('Tệp quá lớn, giới hạn 10 MB.');const value=JSON.parse(await file.text());const restored=sanitizeProgress(value,questions);if(!confirm('Thay thế tiến trình trên trình duyệt này bằng tệp đã chọn?'))return;progress=restored;progress.session=newSession('practice',questions.map(q=>q.id));search='';filter='all';$('search').value='';$('status-filter').value='all';save();render();$('backup-dialog').close();toast('Đã khôi phục tiến trình.')}catch(error){toast(error.message||'Không đọc được bản sao lưu.')}finally{event.target.value=''}});

async function initialize(){
  try{
    const account=await authorize();if(!account)return;STORAGE=`ssg105-member:${account.id}`;
    const bank=await loadBank();
    questions=bank.questions;if(!Array.isArray(questions)||!questions.length)throw new Error('Chủ nhóm chưa mở bộ câu hỏi SSG105.');byId=new Map(questions.map(q=>[q.id,q]));
    progress=fresh();const saved=await readProgress();if(saved){progress=sanitizeProgress(saved,questions);progress.session=reviveSession(saved.session);}
    progress.session??=newSession('practice',questions.map(q=>q.id));save();render();$('load-status').hidden=true;$('app-content').hidden=false;
  }catch(error){const message=`${error.message} Hãy tải lại trang để thử lại.`;$('load-status').textContent=message;if(!$('auth-gate').hidden)$('auth-message').textContent=message;}
}
initialize();
