import {readFile,writeFile} from 'node:fs/promises';
const bank=JSON.parse(await readFile(new URL('../private-data/bank.json',import.meta.url),'utf8'));
if(bank.questions?.length!==130)throw Error('SSG bank is incomplete.');
const rows=bank.questions.map(q=>`(${q.id},'${JSON.stringify(q).replaceAll("'","''")}'::jsonb,true)`);
const sql='-- PRIVATE SSG105 content. Never commit or publish this file.\ninsert into public.ssg_questions(id,data,published) values\n'+rows.join(',\n')+'\non conflict(id) do update set data=excluded.data,published=excluded.published;\n';
await writeFile(new URL('../private-data/seed.sql',import.meta.url),sql);
console.log('Prepared private seed for 130 questions outside the public deployment.');
