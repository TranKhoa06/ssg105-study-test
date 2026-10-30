import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {grade,statistics,shuffled,sanitizeProgress} from '../docs/logic.mjs';
const require=createRequire(process.env.SSG_TEST_DEPENDENCIES||import.meta.url);
const {JSDOM}=require('jsdom');
const html=await readFile(new URL('../docs/index.html',import.meta.url),'utf8');
const app=(await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('unauthenticated startup never requests the private bank or shows the workspace',async()=>{
  const dom=new JSDOM(html,{url:'https://example.github.io/ssg/',runScripts:'outside-only'});
  let reads=0;
  Object.assign(dom.window,{grade,statistics,shuffled,sanitizeProgress,structuredClone,
    authorize:async()=>null,loadBank:async()=>{reads++;return {questions:[]}},
    readProgress:async()=>null,writeProgress:async()=>{},sourceImage:async()=>'',releaseImage:()=>{},setBeforeSignOut:()=>{},
  });
  dom.window.eval(app);await flush();await flush();
  assert.equal(reads,0);
  assert.equal(dom.window.document.getElementById('protected-workspace').hidden,true);
  assert.equal(dom.window.document.getElementById('question-host').textContent,'');
  dom.window.close();
});
test('an authorization error is visible on the login gate rather than lost inside the hidden workspace',async()=>{
  const dom=new JSDOM(html,{url:'https://example.github.io/ssg/',runScripts:'outside-only'});
  Object.assign(dom.window,{grade,statistics,shuffled,sanitizeProgress,structuredClone,
    authorize:async()=>{throw Error('Membership check unavailable')},loadBank:async()=>{throw Error('Should not load private bank')},
    readProgress:async()=>null,writeProgress:async()=>{},sourceImage:async()=>'',releaseImage:()=>{},setBeforeSignOut:()=>{},
  });
  dom.window.eval(app);await flush();await flush();
  assert.match(dom.window.document.getElementById('auth-message').textContent,/Membership check unavailable/);
  assert.equal(dom.window.document.getElementById('protected-workspace').hidden,true);
  dom.window.close();
});
