import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyCandidateManifest} from '../verification-inputs/candidate-binding.mjs';
import {validateBatchPlan,selectBatch} from '../verification-inputs/batch-partition.mjs';
const root=new URL('../',import.meta.url);
const base=new URL('../../../contrast-p57-memory-execution-v1/runtime/p390-00-11/input/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('contrast-p57-approved-batch-inputs.json',root)));
const frozen=JSON.parse(readFileSync(new URL('frozen-v3-inputs.json',base)));
const plan=JSON.parse(readFileSync(new URL('batch-plan.json',base)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('candidate verifier accepts only bound candidate with exact original full57 inventory',()=>{
 assert.equal(verifyCandidateManifest(manifest,frozen),true);assert.equal(validateBatchPlan(manifest,plan),true);
 const all=plan.executionOrder.flatMap(id=>selectBatch(manifest,plan,id).batch.nodes.map(n=>n.stateId+':'+n.sourceAuditNodeIndex));
 assert.equal(all.length,57);assert.equal(new Set(all).size,57);
 assert.deepEqual(plan.executionOrder,['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']);
});
for(const [name,mutate] of [
 ['old HTML',m=>m.sourceFiles[0]=structuredClone(frozen.sourceFiles[0])],
 ['other HTML',m=>m.sourceFiles[0].sha256='f'.repeat(64)],
 ['old style',m=>m.paintScope.stylesSha256=frozen.paintScope.stylesSha256],
 ['other style',m=>m.paintScope.stylesSha256='e'.repeat(64)],
 ['changed source path',m=>m.sourceFiles[0].source='/other/P.html'],
 ['changed packet',m=>m.sourceFiles[1].sha256='0'.repeat(64)],
 ['missing source',m=>m.sourceFiles.pop()],
 ['broad surface',m=>m.paintScope.surface.selector='.panel'],
 ['changed route',m=>m.route='#/other'],
 ['changed occurrence',m=>m.states[0].nodes[0].expectedText='altered'],
 ['missing occurrence',m=>m.states[1].nodes.pop()],
 ['larger budget',m=>m.stopAfterElapsedMs=90001],
 ['missing controls',m=>m.syntheticFixtureRevision.totalBrowserControls=49],
])test('candidate binding rejects '+name,()=>{const m=structuredClone(manifest);mutate(m);assert.throws(()=>verifyCandidateManifest(m,frozen));});
test('candidate actual style-list hash equals browser allTextContents serialization binding',()=>{
 const html=readFileSync(new URL('actual/study/P.html',root),'utf8');
 const styles=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
 assert.equal(hash(JSON.stringify(styles)),manifest.paintScope.stylesSha256);
 assert.equal(styles.length,1);assert.equal(html.match(/\.reduction-workspace>\.panel\.trial-inspector\{box-shadow:none\}/g).length,1);
 assert.equal(hash(html),manifest.sourceFiles[0].sha256);
});
