import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { grade,statistics,sanitizeProgress,shuffled } from '../docs/logic.mjs';
const bank=await readFile(new URL('../private-data/bank.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>null);
test('all 130 numbered pairs are present; each image exists',{skip:!bank},async()=>{
  assert.deepEqual(bank.questions.map(q=>q.id),Array.from({length:130},(_,i)=>i+1));
  for(const q of bank.questions){await access(fileURLToPath(new URL(`../private-data/${q.questionImage}`,import.meta.url)));await access(fileURLToPath(new URL(`../private-data/${q.answerImage}`,import.meta.url)));}
});
test('only question 100 is ungraded because its answer image is blank',{skip:!bank},()=>{
  assert.deepEqual(bank.questions.filter(q=>!q.gradeable).map(q=>q.id),[100]);
  assert.equal(grade(bank.questions.find(q=>q.id===100),['B']),null);
  for(const q of bank.questions.filter(q=>q.gradeable)){assert.equal(grade(q,q.correct),true);assert.ok(q.correct.every(id=>q.choices.some(c=>c.id===id)));}
});
test('both four- and five-option questions retain source order without watermark text',{skip:!bank},()=>{
  assert.equal(bank.questions.filter(q=>q.choices.length===4).length,63);
  assert.equal(bank.questions.filter(q=>q.choices.length===5).length,67);
  for(const q of bank.questions){assert.deepEqual(q.choices.map(c=>c.id),'ABCDE'.slice(0,q.choices.length).split(''));assert.ok(!q.choices.some(c=>/hoàng\s*hoàng.*source/i.test(c.text)));}
  assert.equal(bank.questions.find(q=>q.id===38).choices.length,4);
  assert.equal(bank.questions.find(q=>q.id===119).choices.length,5);
});
test('grading rejects partial, extra, repeated and foreign selections',()=>{
  const q={gradeable:true,choices:['A','B','C','D','E'].map(id=>({id})),correct:['B','E']};
  assert.equal(grade(q,['E','B']),true);for(const selection of [[],['B'],['B','E','A'],['B','B','E'],['B','F']])assert.equal(grade(q,selection),false);
});
test('a successful retry leaves first-attempt statistics intact and clears wrong review',{skip:!bank},()=>{
  const q=bank.questions[0],attempts=[{questionId:q.id,selected:['A'],correct:false},{questionId:q.id,selected:['B'],correct:true}];
  const result=statistics([q],attempts);assert.equal(result.answered,1);assert.equal(result.firstCorrect,0);assert.deepEqual(result.wrongIds,[]);
});
test('restoring progress recomputes scores, preserves unanswered exam records and ignores foreign IDs',{skip:!bank},()=>{
  const now=new Date().toISOString();
  const result=sanitizeProgress({version:1,subject:'SSG105',attempts:[{questionId:1,selected:['A'],correct:true,at:now},{questionId:2,selected:[],correct:true,at:now},{questionId:999,selected:['A'],at:now}],bookmarks:[1,1,999]},bank.questions);
  assert.equal(result.attempts.length,2);assert.equal(result.attempts[0].correct,false);assert.equal(result.attempts[1].correct,false);assert.deepEqual(result.bookmarks,[1]);
  assert.throws(()=>sanitizeProgress({version:1,subject:'OTHER'},bank.questions));
});
test('shuffling questions does not mutate source order or option mappings',()=>{
  const ids=[1,2,3,4],result=shuffled(ids,()=>0);assert.deepEqual(ids,[1,2,3,4]);assert.deepEqual([...result].sort(),ids);assert.notDeepEqual(result,ids);
});

