import assert from 'node:assert/strict';
// The frozen original remains immutable. Only these exact approved candidate fields differ.
export function verifyCandidateManifest(manifest,frozenManifest) {
  const originalEntry={"path":"actual/study/P.html","source":"/workspace/repro-development-rv5abotj/repro/.repro-runs/cloud-continuation/release-completion-v1/browser/contrast-followup/input/actual/study/P.html","sha256":"a8fa8f83540c4377901ffe305c1a1943f0a512332b4f14f7a54eec99db433646","bytes":398403};
  const candidateEntry={"path":"actual/study/P.html","source":"/workspace/repro-development-rv5abotj/repro/.repro-runs/hci-comparator/p57-inspector-shadow-none-20261015T031400Z-b7541c83/P.html","sha256":"a7c31a08d5a0cb23a40dbee32ccc1b928c78c80a1fd665ba5247cd15837d245f","bytes":398463};
  const candidatePaint={"stylesSha256":"06504d654ace79a91d63504e9ab7e5657ebb96a3ffef3f95adbf54d990f521a8","scope":"Exact approved corrected-CSS P HTML and unchanged completed selected job/trial state. Only inspector shadow:none and required CSP/style identity differ. State-wide inventory scans all elements/pseudos before rectangle prefilter; per-step recomputation of all effect/focus/hover candidates. No generic blurred shadow extent accepted.","surface":{"kind":"frozen-P-panel","selector":".reduction-workspace > section.panel:not(.trial-inspector)","profile":{"tag":"SECTION","className":"panel","backgroundColor":"rgb(255, 255, 255)","radii":["10px","10px","10px","10px"],"borders":["1px","1px","1px","1px"],"boxShadow":"rgba(24, 35, 49, 0.02) 0px 2px 6px 0px"}}};
  assert.deepEqual(frozenManifest.sourceFiles[0],originalEntry,'Exact sealed original HTML provenance');
  for(const [key,value] of Object.entries(frozenManifest)) {
    if(['revision','probeSources'].includes(key))continue;
    const expected=key==='sourceFiles'?[candidateEntry,...value.slice(1)]:key==='paintScope'?candidatePaint:value;
    assert.deepEqual(manifest[key],expected,'Exact approved full57 manifest field '+key);
  }
  assert.equal(manifest.stopAfterElapsedMs,90000,'Unchanged internal budget');
  return true;
}
