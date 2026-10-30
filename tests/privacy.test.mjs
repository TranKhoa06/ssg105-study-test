import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
const root=new URL('../docs/',import.meta.url);
async function files(directory=root,prefix=''){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const name=prefix+entry.name;
    if(entry.isDirectory())output.push(...await files(new URL(entry.name+'/',directory),name+'/'));
    else output.push(name);
  }
  return output;
}
test('public deployment contains no source images or question bank',async()=>{
  const publicFiles=await files();
  assert.ok(publicFiles.length>5);
  assert.ok(!publicFiles.some(name=>/\.(jpg|jpeg|png|webp|pdf|json)$/i.test(name)));
  for(const name of publicFiles.filter(n=>/\.(mjs|html)$/.test(n)&&!n.startsWith('vendor/'))){
    const source=await readFile(new URL(name,root),'utf8');
    assert.ok(!source.includes('data:image/jpeg;base64,'),`Image bytes leaked into ${name}`);
    assert.ok(!source.includes("fetch('bank.json')"),`Public bank fallback in ${name}`);
  }
});
test('workspace is hidden before real authentication and images use private Storage',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  const app=await readFile(new URL('app.mjs',root),'utf8');
  const cloud=await readFile(new URL('cloud.mjs',root),'utf8');
  assert.match(html,/id="protected-workspace" hidden/);
  assert.match(app,/await authorize\(\)/);
  assert.match(cloud,/member\.status!=='active'/);
  assert.match(cloud,/from\('ssg105-private'\)\.download/);
  assert.ok(!cloud.includes('getPublicUrl'));
});
