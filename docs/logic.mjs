export function grade(question, selected) {
  if (!question?.gradeable) return null;
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length ||
      selected.some(id => !question.choices.some(choice => choice.id === id))) return false;
  return selected.length === question.correct.length && question.correct.every(id => selected.includes(id));
}
export function statistics(questions, attempts) {
  const first = new Map(), latest = new Map();
  const valid = new Map(questions.map(question => [question.id, question]));
  for (const attempt of attempts) {
    if (!valid.has(attempt.questionId)) continue;
    if (!first.has(attempt.questionId)) first.set(attempt.questionId, attempt);
    latest.set(attempt.questionId, attempt);
  }
  return { first, latest, answered: first.size, firstCorrect: [...first.values()].filter(a=>a.correct).length,
    wrongIds: [...latest.values()].filter(a=>!a.correct).map(a=>a.questionId) };
}
export function shuffled(items, random = Math.random) {
  const output = [...items];
  for (let i=output.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [output[i],output[j]]=[output[j],output[i]]; }
  return output;
}
export function sanitizeProgress(input, questions) {
  if (!input || input.version !== 1 || input.subject !== 'SSG105') throw new Error('Tệp không phải tiến trình SSG105 phiên bản 1.');
  const byId = new Map(questions.map(q=>[q.id,q]));
  const attempts = (Array.isArray(input.attempts)?input.attempts:[]).slice(-50000).filter(a=>{
    const q=byId.get(a?.questionId);
    return q?.gradeable && Array.isArray(a.selected) &&
      new Set(a.selected).size===a.selected.length && a.selected.every(id=>q.choices.some(c=>c.id===id)) &&
      !Number.isNaN(Date.parse(a.at));
  }).map(a=>({questionId:a.questionId,selected:[...a.selected],correct:grade(byId.get(a.questionId),a.selected),at:a.at}));
  const bookmarks=[...new Set((Array.isArray(input.bookmarks)?input.bookmarks:[]).filter(id=>byId.has(id)))];
  return { version:1,subject:'SSG105',attempts,bookmarks,session:null };
}
