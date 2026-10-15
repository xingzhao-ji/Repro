// Approved prospective P57 corrected-CSS batch: exact frozen partition and all 50 control bodies retained. External continuation review required.
// Supplemental measurement only. The original axe audits and release result remain unchanged.
import assert from 'node:assert/strict';
import { verifyCandidateManifest } from './candidate-binding.mjs';
const approvedBatchIds=Object.freeze(['p390-00-11','p320-00-10','p390-12-23','p320-11-21','p320-22-32']);
import { openSync as lifecycleOpenSync, readSync as lifecycleReadSync, closeSync as lifecycleCloseSync } from 'node:fs';
import { validateBatchPlan, selectBatch, assertBatchSourceComplete } from './batch-partition.mjs';
import { createEvidenceStore } from './evidence-store.mjs';
import { readSelectionSnapshot, checkSelectionSnapshot, selectionSelfTest, runSelectionBrowserControls } from './selection-state.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function checkIdentity(observed, expected) {
  assert.equal(observed.tag, 'TD', 'Exact cell tag');
  assert.deepEqual(observed.attributes, [], 'Frozen report message cells have no attributes');
  assert.equal(observed.childElementCount, 0, 'Message has no nested element/alternate paint');
  assert.equal(observed.childNodeCount, 1, 'Exactly one original text node');
  assert.equal(observed.firstChildType, 3, 'Original text node');
  assert.equal(observed.text, expected.event.message, 'Independent frozen packet message identity');
  assert.equal(observed.sequence, String(expected.event.seq), 'Independent packet event sequence');
  assert.equal(observed.time, expected.event.at, 'Independent packet event timestamp');
  assert.equal(observed.eventTypeAndAction, expected.event.type + (expected.event.actionId ?? 'Not action-specific'), 'Independent packet event kind/action');
  assert.equal(observed.eventRowIndex, expected.eventRowIndex, 'Exact event row position');
  assert.equal(observed.columnIndex, 4, 'Exact message column');
  assert.equal(observed.region, 'Recorded events', 'Exact report region');
  if (expected.originalHtml === '<td>') {
    // Deliberately partial axe serialization: do not equate it to full outerHTML.
    assert.equal(observed.outerHTML.slice(0, 4), expected.originalHtml, 'Available original opening tag');
  } else assert.equal(observed.outerHTML, expected.originalHtml, 'Complete original axe HTML');
  return { mode: expected.originalHtml === '<td>' ? 'partial-axe-tag-plus-exact-frozen-event' : 'full-axe-html-plus-exact-frozen-event',
    outerHTML: observed.outerHTML, outerHtmlSha256: digest(observed.outerHTML), text: observed.text, textSha256: digest(observed.text),
    eventSha256: digest(JSON.stringify(expected.event)), observed };
}

// Self-contained because Playwright serializes this function into the page.
// This deliberately supports only simple, opaque ASCII text and ordinary ancestor backgrounds.
export async function sampleText(element, options = {}) {
  function rgba(value) {
    const m = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
    if (!m) return null;
    const v = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    return v.every(Number.isFinite) && v.slice(0, 3).every(c => c >= 0 && c <= 255) && v[3] >= 0 && v[3] <= 1 ? v : null;
  }
  const luminance = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const blend = (a, b) => a.slice(0, 3).map((c, i) => c * a[3] + b[i] * (1 - a[3]));
  if (options.mathOnly) return { blackWhite: ratio([0, 0, 0], [255, 255, 255]), identical: ratio([255, 255, 255], [255, 255, 255]),
    inkWhite: ratio([24, 35, 49], [255, 255, 255]), translucentBlackOnWhite: blend([0, 0, 0, 0.5], [255, 255, 255]),
    parsed: rgba('rgba(24, 35, 49, 0.5)'), bad: ['red', 'rgb(256, 0, 0)', 'rgba(0,0,0,2)', 'url(x)'].map(rgba) };
  // Pure helpers live inside the serialized sampler; Node controls execute the exact same code.
  function directTextMapping(nodes) {
    if (!Array.isArray(nodes) || !nodes.length || nodes.some(n => n.type !== 3 || typeof n.data !== 'string')) return null;
    let offset = 0;
    return nodes.map((node, nodeIndex) => { const start = offset; offset += node.data.length; return { nodeIndex, start, end: offset, data: node.data }; });
  }
  function roundedSurface(raw, style) {
    const px = value => /^\d+(?:\.\d+)?px$/.test(value) ? Number(value.slice(0, -2)) : null;
    const radii = style.radii.map(px), borders = style.borders.map(px);
    const shadow = style.boxShadow;
    // Computed single CSS outset shadow: color, x/y offset, nonnegative blur, spread.
    const shadowMatch = shadow === 'none' ? null : /^(rgba?\([^()]+\))\s+(-?\d+(?:\.\d+)?px)\s+(-?\d+(?:\.\d+)?px)\s+(\d+(?:\.\d+)?px)\s+(-?\d+(?:\.\d+)?px)$/.exec(shadow);
    const reasons = [];
    if (radii.some(v => v === null)) reasons.push('unknown-percent-or-elliptic-radius');
    if (borders.some(v => v === null)) reasons.push('unknown-border-width');
    if (shadow !== 'none' && (!shadowMatch || !rgba(shadowMatch[1]))) reasons.push('unknown-multiple-or-inset-shadow');
    if (style.backgroundClip !== 'border-box' || style.backgroundImage !== 'none' || style.borderImageSource !== 'none') reasons.push('unsupported-surface-paint');
    if (radii.every(v => v !== null) && (radii[0]+radii[1] > raw.width || radii[3]+radii[2] > raw.width || radii[0]+radii[3] > raw.height || radii[1]+radii[2] > raw.height)) reasons.push('radius-scaling-required');
    let safeInterior = null;
    if (!reasons.length) {
      safeInterior = { left:raw.left+Math.max(borders[3],radii[0],radii[3]), right:raw.right-Math.max(borders[1],radii[1],radii[2]),
        top:raw.top+Math.max(borders[0],radii[0],radii[1]), bottom:raw.bottom-Math.max(borders[2],radii[2],radii[3]) };
      safeInterior.width = safeInterior.right-safeInterior.left; safeInterior.height = safeInterior.bottom-safeInterior.top;
      if (safeInterior.width <= 0 || safeInterior.height <= 0) reasons.push('empty-safe-interior');
    }
    return { supported:reasons.length === 0, reasons, raw, computed:style, radii, borders, parsedShadow:shadowMatch ? {color:rgba(shadowMatch[1]), x:parseFloat(shadowMatch[2]), y:parseFloat(shadowMatch[3]), blur:parseFloat(shadowMatch[4]), spread:parseFloat(shadowMatch[5]), inset:false} : null, safeInterior };
  }
  // This is a bounded frozen-P diagnostic, not a generic CSS paint solver.
  const surfaceEligible=(enabled,opaque,color,needsSupport)=>Boolean(enabled&&!opaque&&color?.[3]===1&&needsSupport);
  if(options.surfaceEligibilityOnly) return surfaceEligible(...options.surfaceEligibilityOnly);
  function surfaceBoxScope(raw, scope) {
    const reasons = [], boxes = scope?.clientRects ?? [];
    if (!scope?.selectedSurface) reasons.push('surface-outside-reviewed-scope');
    if (scope?.display !== 'block' || scope?.writingMode !== 'horizontal-tb' || scope?.columnCount !== 'auto' || scope?.columnWidth !== 'auto') reasons.push('surface-not-single-ordinary-block');
    const keys = ['left','right','top','bottom','width','height'];
    if (boxes.length !== 1 || keys.some(key => !Number.isFinite(raw[key]) || boxes[0]?.[key] !== raw[key]) || raw.width <= 0 || raw.height <= 0) reasons.push('fragmented-or-unknown-surface-box');
    return { supported:reasons.length === 0, reasons, ...scope };
  }
  function outsidePaintDecision(effect, boxes, target) {
    const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const unknown = [];
    if (effect.generatedPseudo) unknown.push('unrelated-generated-paint-extent-unknown');
    if (effect.filter !== 'none' || effect.backdropFilter !== 'none' || effect.maskImage !== 'none' || effect.clipPath !== 'none' || effect.transform !== 'none' || effect.mixBlendMode !== 'normal') unknown.push('unrelated-filter-mask-transform-or-blend-extent-unknown');
    if (effect.textShadow !== 'none') unknown.push('unrelated-text-shadow-extent-unknown');
    if (effect.outlineStyle !== 'none' && parseFloat(effect.outlineWidth) > 0) unknown.push('unrelated-outline-extent-unknown');
    if (effect.animationName !== 'none' || effect.transitionDuration.split(',').some(v => parseFloat(v) !== 0)) unknown.push('unrelated-dynamic-paint');
    let extent = [];
    if (effect.boxShadow !== 'none') {
      const m = /^(rgba?\([^()]+\))\s+(-?\d+(?:\.\d+)?px)\s+(-?\d+(?:\.\d+)?px)\s+(\d+(?:\.\d+)?px)\s+(-?\d+(?:\.\d+)?px)$/.exec(effect.boxShadow);
      // No finite extent is asserted for blur, unknown syntax, multiple or inset shadows.
      if (!m || !rgba(m[1]) || parseFloat(m[4]) !== 0 || boxes.length !== 1) unknown.push('unrelated-shadow-extent-unknown');
      else {
        const x=parseFloat(m[2]),y=parseFloat(m[3]),spread=Math.max(0,parseFloat(m[5]));
        extent=boxes.map(b=>({left:b.left+x-spread,right:b.right+x+spread,top:b.top+y-spread,bottom:b.bottom+y+spread}));
      }
    }
    const intersects = extent.some(b=>overlap(b,target));
    return { supported:unknown.length === 0 && !intersects, reasons:[...unknown,...(intersects?['unrelated-shadow-may-intersect-target']:[])], extent };
  }
  if (options.surfaceScopeOnly) return surfaceBoxScope(options.surfaceScopeOnly.raw, options.surfaceScopeOnly.scope);
  if (options.outsidePaintOnly) return outsidePaintDecision(options.outsidePaintOnly.effect, options.outsidePaintOnly.boxes, options.outsidePaintOnly.target);
  if (options.textMappingOnly) return directTextMapping(options.textMappingOnly);
  if (options.geometryOnly) return roundedSurface(options.geometryOnly.raw, options.geometryOnly.style);
  const rect = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
  const identify = el => el ? ({ tag: el.tagName, id: el.id, className: el.className, role: el.getAttribute('role'), label: el.getAttribute('aria-label') }) : null;
  const inside = (a, b) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  function effectOf(other) {
    const s=getComputedStyle(other);
    const pseudos=['::before','::after'].map(pseudo=>{const p=getComputedStyle(other,pseudo);return {pseudo,content:p.content,display:p.display};});
    return { display:s.display,visibility:s.visibility,opacity:s.opacity,boxShadow:s.boxShadow,textShadow:s.textShadow,
      filter:s.filter,backdropFilter:s.backdropFilter,maskImage:s.maskImage,clipPath:s.clipPath,transform:s.transform,mixBlendMode:s.mixBlendMode,
      outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,animationName:s.animationName,transitionDuration:s.transitionDuration,pseudos,
      generatedPseudo:pseudos.some(p=>p.display!=='none'&&p.content!=='none'&&p.content!=='normal') };
  }
  function captureOutsideInventory() {
    const all=[...document.querySelectorAll('body *')], candidates=[];
    for (const [index,other] of all.entries()) {
      const effect=effectOf(other);
      // Include every frozen focusable element and the hover-filter button even when
      // focus outline/filter is inactive at capture. Synthetic controls have static CSS.
      if (!outsidePaintDecision(effect,[],{left:0,right:0,top:0,bottom:0}).supported || effect.boxShadow!=='none' || other.matches('button,a,input,select,textarea,summary,[tabindex]')) candidates.push({index,owner:identify(other),captured:effect});
    }
    return {schemaVersion:1,totalElements:all.length,checkedElements:all.length,candidates,
      styles:[...document.querySelectorAll('style')].map(el=>el.textContent),externalStylesheets:document.querySelectorAll('link[rel="stylesheet"]').length,
      inlineStyledElements:document.querySelectorAll('[style]').length,scope:'Exact frozen P styles/DOM, or static synthetic controls; all effects inventoried before raw-box rejection. Blurred unrelated shadows stay unknown.'};
  }
  if (options.captureOutsidePaintInventoryOnly) return captureOutsideInventory();
  function clipOf(owner) {
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let a = owner; a; a = a.parentElement) {
      const s = getComputedStyle(a), b = a.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clip.left = Math.max(clip.left, b.left + a.clientLeft); clip.right = Math.min(clip.right, b.left + a.clientLeft + a.clientWidth); }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { clip.top = Math.max(clip.top, b.top + a.clientTop); clip.bottom = Math.min(clip.bottom, b.top + a.clientTop + a.clientHeight); }
    }
    return clip;
  }
  function paint(owner) {
    const issues = [], ancestry = [], layers = [];
    const style = getComputedStyle(owner), foreground = rgba(style.color);
    if (!foreground || foreground[3] !== 1) issues.push('unsupported-or-translucent-foreground');
    if (style.webkitTextFillColor && style.webkitTextFillColor !== style.color) issues.push('different-text-fill');
    if (style.textTransform !== 'none' || style.textDecorationLine !== 'none' || style.writingMode !== 'horizontal-tb' || style.direction !== 'ltr') issues.push('unsupported-text-presentation');
    if (parseFloat(style.webkitTextStrokeWidth) !== 0) issues.push('text-stroke');
    let opaque = false;
    for (let a = owner; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const entry = { ...identify(a), color: s.color, backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage,
        backgroundClip: s.backgroundClip, opacity: s.opacity, filter: s.filter, backdropFilter: s.backdropFilter, mixBlendMode: s.mixBlendMode,
        textShadow: s.textShadow, boxShadow: s.boxShadow, clipPath: s.clipPath, maskImage: s.maskImage, transform: s.transform,
        visibility: s.visibility, display: s.display, fontSize: s.fontSize, fontWeight: s.fontWeight,
        borderRadius: s.borderRadius, animationName: s.animationName, transitionProperty: s.transitionProperty, transitionDuration: s.transitionDuration };
      const surfaceColor = rgba(s.backgroundColor);
      const needsSurfaceSupport = s.boxShadow !== 'none' || s.borderRadius.split(/[ /]/).some(v => parseFloat(v) !== 0);
      const surface = surfaceEligible(options.allowOpaqueRoundedSurface,opaque,surfaceColor,needsSurfaceSupport)
        ? roundedSurface(rect(a.getBoundingClientRect()), { radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius],
          borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth], boxShadow:s.boxShadow, backgroundClip:s.backgroundClip, backgroundImage:s.backgroundImage, borderImageSource:s.borderImageSource }) : null;
      if (surface) {
        const selection=options.surfaceScope;
        const selectedSurface=Boolean(selection && a.matches(selection.selector) && document.querySelectorAll(selection.selector).length===1);
        const scope=surfaceBoxScope(rect(a.getBoundingClientRect()), {selectedSurface,display:s.display,writingMode:s.writingMode,columnCount:s.columnCount,columnWidth:s.columnWidth,clientRects:[...a.getClientRects()].map(rect)});
        surface.scope=scope;surface.reasons.push(...scope.reasons);
        if (selection?.kind==='frozen-P-panel') {
          const expected=selection.profile;
          const actual={tag:a.tagName,className:a.className,backgroundColor:s.backgroundColor,radii:surface.computed.radii,borders:surface.computed.borders,boxShadow:s.boxShadow};
          surface.reviewedProfile={expected,actual};
          if (JSON.stringify(actual)!==JSON.stringify(expected)) surface.reasons.push('surface-profile-outside-reviewed-frozen-P');
        } else if (selection?.kind!=='synthetic-control') surface.reasons.push('surface-scope-not-declared');
        surface.supported=surface.reasons.length===0;
        entry.opaqueSurface = surface;
      }
      ancestry.push(entry);
      if (Number(s.opacity) !== 1) issues.push('ancestor-opacity');
      if (s.filter !== 'none' || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal') issues.push('filter-or-blend');
      if (s.clipPath !== 'none' || s.maskImage !== 'none' || s.transform !== 'none') issues.push('clip-mask-or-transform');
      if (s.visibility !== 'visible' || s.display === 'none') issues.push('not-rendered');
      if (s.textShadow !== 'none' || (s.boxShadow !== 'none' && !surface?.supported)) issues.push('shadow-paint');
      if (s.animationName !== 'none' || s.transitionDuration.split(',').some(v => parseFloat(v) !== 0)) issues.push('dynamic-paint');
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(a, pseudo);
        if (p.content !== 'none' && p.content !== 'normal' && p.display !== 'none') issues.push('generated-paint');
      }
      if (!opaque) {
        const color = rgba(s.backgroundColor);
        if (!color) issues.push('unsupported-background-color');
        if (s.backgroundImage !== 'none') issues.push('background-image');
        if (!['border-box', 'padding-box', 'content-box'].includes(s.backgroundClip)) issues.push('unsupported-background-clip');
        if (color && color[3] > 0) {
          if (s.borderRadius.split(/[ /]/).some(v => parseFloat(v) !== 0) && !surface?.supported) issues.push('rounded-background');
          if (surface && !surface.supported) issues.push(...surface.reasons);
          const b = a.getBoundingClientRect();
          let area = rect(b);
          if (s.backgroundClip !== 'border-box') area = { ...area, left: b.left + a.clientLeft, top: b.top + a.clientTop, right: b.left + a.clientLeft + a.clientWidth, bottom: b.top + a.clientTop + a.clientHeight };
          if (s.backgroundClip === 'content-box') area = { ...area, left: area.left + parseFloat(s.paddingLeft), right: area.right - parseFloat(s.paddingRight), top: area.top + parseFloat(s.paddingTop), bottom: area.bottom - parseFloat(s.paddingBottom) };
          if (surface?.supported) area = surface.safeInterior;
          layers.push({ color, area, owner: identify(a), ...(surface ? { opaqueSurface: surface } : {}) });
          if (color[3] === 1) opaque = true;
        }
      }
    }
    const table = owner.closest('table');
    if (table) for (const col of table.querySelectorAll('col,colgroup')) {
      const s = getComputedStyle(col), c = rgba(s.backgroundColor);
      if (!c || c[3] !== 0 || s.backgroundImage !== 'none') issues.push('table-column-background');
    }
    let background = null;
    if (!opaque) issues.push('no-known-opaque-background');
    else { background = layers.at(-1).color.slice(0, 3); for (let i = layers.length - 2; i >= 0; i--) background = blend(layers[i].color, background); }
    const size = parseFloat(style.fontSize), weight = parseFloat(style.fontWeight);
    if (!Number.isFinite(size) || !Number.isFinite(weight)) issues.push('unknown-font-metrics');
    const threshold = size >= 24 || (size >= 18.6666666667 && weight >= 700) ? 3 : 4.5;
    return { issues: [...new Set(issues)], foreground, background, contrastRatio: foreground && background ? ratio(foreground, background) : null,
      requiredContrast: threshold, fontSize: style.fontSize, fontWeight: style.fontWeight, ancestry, layers };
  }
  const sampleStarted = performance.now();
  const result = { status: 'unresolved', reasons: [], steps: [], characters: [], whitespaceOffsets: [], unsupportedOffsets: [], totalCharacters: 0, coveredCharacters: 0 };
  if (element.childElementCount !== 0 || !element.childNodes.length || [...element.childNodes].some(n => n.nodeType !== Node.TEXT_NODE) || (!options.allowDirectAdjacentText && element.childNodes.length !== 1)) { result.reasons.push('exact-single-text-node-required'); return result; }
  const textNodes = [...element.childNodes], textMapping = directTextMapping(textNodes.map(n => ({ type:n.nodeType, data:n.data })));
  const text = textNodes.map(n => n.data).join(''), originalHTML = element.outerHTML;
  result.textNodeMapping = textMapping;
  result.text = text;
  if (text.length > options.maximumCharacters) { result.reasons.push('character-budget-exceeded'); return result; }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (/\s/.test(text[i]) && c < 128) result.whitespaceOffsets.push(i);
    else if (c < 33 || c > 126) result.unsupportedOffsets.push(i);
    else { const node = textMapping.find(n => i >= n.start && i < n.end); result.characters.push({ offset: i, textNodeIndex:node.nodeIndex, textNodeOffset:i-node.start, character: text[i], witness: null }); }
  }
  result.totalCharacters = result.characters.length;
  if (result.unsupportedOffsets.length || !result.characters.length) { result.reasons.push('unsupported-or-empty-ascii-text'); return result; }
  const scrolls = [];
  for (let a = element.parentElement; a; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth) scrolls.push(a);
  }
  if (scrolls.length !== 1) { result.reasons.push('exactly-one-horizontal-scroll-container-required'); return result; }
  const scroller = scrolls[0];
  result.scrollContainer = identify(scroller);
  result.initialScroll = { left: scroller.scrollLeft, top: scroller.scrollTop, windowX: scrollX, windowY: scrollY };
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  await frame();
  const maximum = scroller.scrollWidth - scroller.clientWidth, step = Math.max(1, Math.floor(scroller.clientWidth / 2));
  const positions = [];
  for (let left = 0; left < maximum; left += step) positions.push(left);
  positions.push(maximum);
  result.plannedScrollPositions = positions;
  if (positions.length > options.maximumScrollPositions) { result.reasons.push('scroll-position-budget-exceeded'); return result; }
  const outsideInventory=options.outsidePaintInventory ?? captureOutsideInventory();
  result.outsidePaintInventory={totalElements:outsideInventory.totalElements,checkedElements:outsideInventory.checkedElements,candidateCount:outsideInventory.candidates.length,scope:outsideInventory.scope};
  let paintFingerprint = null;
  for (const requested of positions) {
    const stepStarted = performance.now();
    if (performance.now() > options.stopAtPerformanceMs) { result.reasons.push('internal-time-budget'); break; }
    scroller.scrollTo({ left: requested, top: scroller.scrollTop, behavior: 'instant' });
    await frame();
    if (textNodes.length !== element.childNodes.length || textNodes.some((node,i) => element.childNodes[i] !== node || node.data !== textMapping[i].data) || element.outerHTML !== originalHTML) { result.reasons.push('dom-changed-during-sampling'); break; }
    const paintStarted = performance.now();
    const clip = clipOf(element), currentPaint = paint(element);
    const paintDurationMs = performance.now() - paintStarted;
    const fingerprint = JSON.stringify({ ...currentPaint,
      ancestry: currentPaint.ancestry.map(({ opaqueSurface, ...ancestor }) => ({ ...ancestor, ...(opaqueSurface ? { opaqueSurface: {supported:opaqueSurface.supported,reasons:opaqueSurface.reasons,computed:opaqueSurface.computed} } : {}) })),
      layers: currentPaint.layers.map(({ area, opaqueSurface, ...layer }) => ({ ...layer, ...(opaqueSurface ? { opaqueSurface: {supported:opaqueSurface.supported,reasons:opaqueSurface.reasons,computed:opaqueSurface.computed} } : {}) })) });
    if (paintFingerprint !== null && fingerprint !== paintFingerprint) result.reasons.push('paint-changed-between-scroll-positions');
    paintFingerprint = fingerprint;
    result.paint ??= currentPaint;
    result.reasons.push(...currentPaint.issues);
    // Conservative sibling-box overlap scan catches pointer-events:none overlays too.
    // Transparent unrelated boxes are also treated as unresolved rather than assumed harmless.
    const cellRect = element.getBoundingClientRect();
    const allElements = [...document.querySelectorAll('body *')];
    // This scan is independent of (and precedes) both historical rectangle scans.
    // Inventory is safe to reuse only within the exact frozen CSS/DOM scope checked
    // by the runner. Every inventoried effect is re-read at each scroll position.
    const outsidePaint = [];
    if (allElements.length !== outsideInventory.totalElements) result.reasons.push('outside-paint-inventory-topology-changed');
    for (const candidate of outsideInventory.candidates) {
      const other=allElements[candidate.index];
      if (!other || JSON.stringify(identify(other))!==JSON.stringify(candidate.owner)) { result.reasons.push('outside-paint-inventory-identity-changed');continue; }
      if (other===element || other.contains(element) || element.contains(other)) continue;
      const effect=effectOf(other);
      // display:none suppresses the entire element; otherwise an empty/disjoint box
      // does not establish absence of generated content or effects outside the box.
      if (effect.display==='none' || effect.visibility!=='visible' || Number(effect.opacity)===0) continue;
      const boxes=[...other.getClientRects()].map(rect),decision=outsidePaintDecision(effect,boxes,rect(cellRect));
      const record={owner:identify(other),effect,boxes,...decision};outsidePaint.push(record);
      result.reasons.push(...decision.reasons);
    }
    // Rectangle-list equivalence covers ordinary client boxes only. The separate
    // outsidePaint guard above rejects effects this historical scan cannot bound.
    function occluders(prefilter) {
      const found = []; let considered = 0, rawCandidates = 0;
      for (const other of allElements) {
        if (other === element || other.contains(element) || element.contains(other)) continue;
        considered++;
        let boxes;
        if (prefilter) {
          boxes = [...other.getClientRects()].filter(box => overlaps(box, cellRect));
          if (!boxes.length) continue;
        }
        const s = getComputedStyle(other);
        if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) continue;
        boxes ??= [...other.getClientRects()];
        for (const box of boxes) {
          rawCandidates++;
          const c = clipOf(other), effective = { left: Math.max(box.left, c.left), right: Math.min(box.right, c.right), top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
          if (effective.left < effective.right && effective.top < effective.bottom && overlaps(effective, cellRect)) found.push({ owner: identify(other), rect: effective });
        }
      }
      return { found, considered, rawCandidates };
    }
    const scanStarted = performance.now(), optimized = occluders(true);
    const optimizedScanDurationMs = performance.now() - scanStarted;
    const possibleOccluders = optimized.found;
    let equivalence = { checked: false };
    if (options.verifyOccluderEquivalence) {
      const legacyStarted = performance.now(), legacy = occluders(false);
      equivalence = { checked: true, equal: JSON.stringify(legacy.found) === JSON.stringify(possibleOccluders), legacyDurationMs: performance.now() - legacyStarted,
        legacyCandidates: legacy.rawCandidates, optimizedCandidates: optimized.rawCandidates, legacyOccluders: legacy.found };
      if (!equivalence.equal) result.reasons.push('occluder-prefilter-equivalence-failed');
    }
    const entry = { index: result.steps.length, requestedScrollLeft: requested, actualScrollLeft: scroller.scrollLeft, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
      viewport: { width: innerWidth, height: innerHeight }, windowScroll: { x: scrollX, y: scrollY }, clip, paint: currentPaint,
      timing: { paintDurationMs, optimizedScanDurationMs }, occluderEquivalence: equivalence, scannedElements: optimized.considered, rawCandidates: optimized.rawCandidates,
      newCovered: 0, outsideClip: 0, hitTestRejected: 0, overlapRejected: 0, backgroundAreaRejected: 0, noRangeRect: 0, possibleOccluders, outsidePaint };
    const coverageStarted = performance.now();
    for (const char of result.characters) {
      if (char.witness) continue;
      const range = document.createRange(); range.setStart(textNodes[char.textNodeIndex], char.textNodeOffset); range.setEnd(textNodes[char.textNodeIndex], char.textNodeOffset + 1);
      const boxes = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(rect);
      if (!boxes.length) { entry.noRangeRect++; continue; }
      if (boxes.some(box => !inside(box, clip))) { entry.outsideClip++; continue; }
      if (boxes.some(box => currentPaint.layers.some(layer => !inside(box, layer.area)))) { entry.backgroundAreaRejected++; continue; }
      const witnesses = boxes.map(box => ({ rect: box, points: [0.1, 0.5, 0.9].map(fraction => {
        const x = box.left + box.width * fraction, y = (box.top + box.bottom) / 2, hit = document.elementFromPoint(x, y);
        return { x, y, hit: identify(hit), unobscured: hit === element };
      }) }));
      if (witnesses.some(w => w.points.some(p => !p.unobscured))) { entry.hitTestRejected++; continue; }
      if (boxes.some(box => possibleOccluders.some(other => overlaps(box, other.rect)))) { entry.overlapRejected++; continue; }
      if (currentPaint.issues.length || outsidePaint.some(effect=>!effect.supported)) continue;
      char.witness = { stepIndex: entry.index, actualScrollLeft: scroller.scrollLeft, clip, ranges: witnesses,
        contrastRatio: currentPaint.contrastRatio, requiredContrast: currentPaint.requiredContrast };
      entry.newCovered++;
    }
    entry.timing.coverageDurationMs = performance.now() - coverageStarted;
    entry.timing.stepDurationMs = performance.now() - stepStarted;
    result.steps.push(entry);
  }
  result.coveredCharacters = result.characters.filter(c => c.witness).length;
  result.uncoveredOffsets = result.characters.filter(c => !c.witness).map(c => c.offset);
  if (result.uncoveredOffsets.length) result.reasons.push('incomplete-character-coverage');
  result.reasons = [...new Set(result.reasons)];
  result.status = result.reasons.length ? 'unresolved' : result.characters.some(c => c.witness.contrastRatio < c.witness.requiredContrast) ? 'measured-fail' : 'measured-pass';
  result.finalScroll = { left: scroller.scrollLeft, top: scroller.scrollTop, windowX: scrollX, windowY: scrollY };
  result.sampleDurationMs = performance.now() - sampleStarted;
  return result;
}

async function selfTest() {
  const math = await sampleText(null, { mathOnly: true });
  assert.equal(math.blackWhite, 21); assert.equal(math.identical, 1); assert.ok(Math.abs(math.inkWhite - 15.865809304375075) < 1e-12);
  assert.deepEqual(math.translucentBlackOnWhite, [127.5, 127.5, 127.5]); assert.deepEqual(math.parsed, [24, 35, 49, 0.5]); assert.deepEqual(math.bad, [null, null, null, null]);
  const event = { seq: 7, at: '2026-10-13T20:29:42Z', type: 'trial', message: '{"unchanged":true}' };
  const observed = { tag: 'TD', attributes: [], childElementCount: 0, childNodeCount: 1, firstChildType: 3, text: event.message, sequence: '7', time: event.at,
    eventTypeAndAction: 'trialNot action-specific', eventRowIndex: 3, columnIndex: 4, region: 'Recorded events', outerHTML: '<td>{"unchanged":true}</td>' };
  const expected = { event, eventRowIndex: 3, originalHtml: '<td>' };
  checkIdentity(observed, expected); checkIdentity(observed, { ...expected, originalHtml: observed.outerHTML });
  const mutations = [ ['tag','TH'], ['attributes',[['style','color:white']]], ['childElementCount',1], ['childNodeCount',2], ['firstChildType',1], ['text','different'], ['sequence','8'], ['time','changed'], ['eventTypeAndAction','started'], ['eventRowIndex',2], ['columnIndex',3], ['region','Other'], ['outerHTML','<th>different</th>'] ];
  for (const [field, value] of mutations) assert.throws(() => checkIdentity({ ...observed, [field]: value }, expected), field);
  assert.throws(() => checkIdentity(observed, { ...expected, originalHtml: '<td>wrong</td>' }));
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  let rectangleControls = 0;
  const target = { left: 0, right: 2, top: 0, bottom: 2 };
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let w = 0; w <= 4; w++) for (let h = 0; h <= 4; h++) {
    const raw = { left:x, right:x+w, top:y, bottom:y+h };
    for (const clip of [{left:-1,right:1,top:-1,bottom:1},{left:1,right:3,top:1,bottom:3},{left:-4,right:4,top:-4,bottom:4},{left:2,right:2,top:2,bottom:2}]) {
      const clipped = { left:Math.max(raw.left,clip.left),right:Math.min(raw.right,clip.right),top:Math.max(raw.top,clip.top),bottom:Math.min(raw.bottom,clip.bottom) };
      const legacy = clipped.left < clipped.right && clipped.top < clipped.bottom && overlaps(clipped,target);
      assert.equal(overlaps(raw,target) && legacy, legacy, 'Raw-box prefilter must preserve clipped intersection'); rectangleControls++;
    }
  }
  return { status: 'pass', rectangleControls, numericalChecks: 6, identityPositiveControls: 2, identityNegativeControls: 14, math };
}

export function checkTrialIdentity(observed, node, job) {
  const binding = node.packetBinding;
  assert.equal(binding.collection, 'job.result.trials');
  const trial = job.job.result.trials[binding.arrayIndex]; assert.ok(trial); assert.equal(trial.index, binding.trialIndex);
  const group = trial.accepted ? 'kept' : 'rejected'; assert.equal(group, binding.renderedGroup);
  const groupTrials = job.job.result.trials.filter(t => Boolean(t.accepted) === (group === 'kept'));
  assert.equal(groupTrials[node.rowIndex-1].index, trial.index, 'Exact group-relative frozen trial position');
  const field = node.field; assert.ok(['reason','decision','duration'].includes(field)); assert.equal(binding.field, field);
  const text = field === 'reason' ? trial.reason : field === 'decision' ? trial.index === 0 ? 'Baseline' : trial.accepted ? 'Removal accepted' : 'Restored' : `${Math.round(trial.durationMs)} ms`;
  const tag = field === 'reason' ? 'P' : field === 'decision' ? 'TD' : 'SPAN';
  const attributes = field === 'reason' ? [['class','trial-reason']] : field === 'decision' ? [] : [['class','small muted trial-cost']];
  assert.equal(observed.tag, tag); assert.deepEqual(observed.attributes, attributes); assert.equal(observed.childElementCount, 0);
  assert.deepEqual(observed.textNodes, field === 'duration' ? [String(Math.round(trial.durationMs)), ' ms'] : [text], 'Exact renderer text-node boundaries');
  assert.ok(observed.nodeTypes.every(type => type === 3)); assert.equal(observed.nodeTypes.length, observed.textNodes.length);
  assert.equal(observed.text, text); assert.equal(text, node.expectedText); assert.equal(digest(text), node.expectedTextSha256);
  assert.equal(observed.outerHTML, node.originalHtml, 'Complete original axe HTML');
  assert.equal(observed.trialButton, `Inspect trial ${trial.index}`); assert.equal(observed.rowIndex, node.rowIndex);
  assert.equal(observed.group, group); assert.equal(observed.region, 'Reduction trials');
  assert.equal(observed.columnIndex, field === 'reason' ? 3 : field === 'decision' ? 4 : 1);
  return { mode:'full-axe-html-plus-exact-frozen-trial-and-text-node-boundaries', packetBinding:binding, trialSha256:digest(JSON.stringify(trial)), text, textSha256:digest(text), outerHTML:observed.outerHTML, outerHtmlSha256:digest(observed.outerHTML), observed };
}

async function supplementalSelfTest(manifest,packet) {
  const legacy = await selfTest();
  const raw = {left:0,top:0,right:100,bottom:100,width:100,height:100};
  const style = {radii:['10px','10px','10px','10px'],borders:['1px','1px','1px','1px'],boxShadow:'rgba(0, 0, 0, 0.2) 0px 1px 2px 0px',backgroundClip:'border-box',backgroundImage:'none',borderImageSource:'none'};
  const g = await sampleText(null,{geometryOnly:{raw,style}}); assert.equal(g.supported,true); assert.deepEqual(g.safeInterior,{left:10,right:90,top:10,bottom:90,width:80,height:80});
  const negativeStyles = [ {...style,radii:['10%','10px','10px','10px']}, {...style,radii:['10px 5px','10px','10px','10px']}, {...style,boxShadow:'rgba(0, 0, 0, 0.2) 0px 1px 2px 0px inset'}, {...style,boxShadow:style.boxShadow+', '+style.boxShadow}, {...style,boxShadow:'unrecognized'}, {...style,backgroundImage:'linear-gradient(white, black)'}, {...style,borderImageSource:'url(x)'}, {...style,backgroundClip:'content-box'}, {...style,radii:['60px','60px','60px','60px']}, {...style,borders:['1%','1px','1px','1px']} ];
  for (const test of negativeStyles) assert.equal((await sampleText(null,{geometryOnly:{raw,style:test}})).supported,false);
  const mapping = await sampleText(null,{textMappingOnly:[{type:3,data:'12'},{type:3,data:' ms'}]}); assert.deepEqual(mapping,[{nodeIndex:0,start:0,end:2,data:'12'},{nodeIndex:1,start:2,end:5,data:' ms'}]);
  assert.equal(await sampleText(null,{textMappingOnly:[{type:3,data:'x'},{type:1,data:'y'}]}),null);
  assert.equal(await sampleText(null,{textMappingOnly:[]}),null);
  let geometryContainmentChecks = 0;
  for (let x=0;x<=100;x++) for (let y=0;y<=100;y++) {
    const inside=x>=g.safeInterior.left && x<=g.safeInterior.right && y>=g.safeInterior.top && y<=g.safeInterior.bottom;
    if (inside) { assert.ok(x>=10&&x<=90&&y>=10&&y<=90); geometryContainmentChecks++; }
  }
  const trial={index:2,accepted:false,reason:'Known reason',durationMs:4.4}, job={job:{result:{trials:[trial]}}};
  let identityPositiveControls=0,identityNegativeControls=0;
  for (const field of ['reason','decision','duration']) {
    const text=field==='reason'?'Known reason':field==='decision'?'Restored':'4 ms';
    const tag=field==='reason'?'P':field==='decision'?'TD':'SPAN', attributes=field==='reason'?[['class','trial-reason']]:field==='decision'?[]:[['class','small muted trial-cost']];
    const html=`<${tag.toLowerCase()}${attributes.length?' class="'+attributes[0][1]+'"':''}>${text}</${tag.toLowerCase()}>`;
    const node={field,rowIndex:1,expectedText:text,expectedTextSha256:digest(text),originalHtml:html,packetBinding:{collection:'job.result.trials',arrayIndex:0,trialIndex:2,renderedGroup:'rejected',field}};
    const observed={tag,attributes,childElementCount:0,textNodes:field==='duration'?['4',' ms']:[text],nodeTypes:field==='duration'?[3,3]:[3],text,outerHTML:html,trialButton:'Inspect trial 2',rowIndex:1,group:'rejected',region:'Reduction trials',columnIndex:field==='reason'?3:field==='decision'?4:1};
    checkTrialIdentity(observed,node,job); identityPositiveControls++;
    for (const [key,value] of [['tag','I'],['attributes',[]],['childElementCount',1],['textNodes',['wrong']],['nodeTypes',[1]],['text','wrong'],['outerHTML','wrong'],['trialButton','Inspect trial 3'],['rowIndex',2],['group','kept'],['region','Other'],['columnIndex',9]]) {
      if (key==='attributes'&&field==='decision') continue;
      assert.throws(()=>checkTrialIdentity({...observed,[key]:value},node,job)); identityNegativeControls++;
    }
    assert.throws(()=>checkTrialIdentity(observed,{...node,packetBinding:{...node.packetBinding,trialIndex:3}},job));identityNegativeControls++;
  }
  const guardControls=await guardSelfTest();
  const selectionControls=manifest.states.map(state=>selectionSelfTest(manifest,state,packet));
  return {status:'pass',legacy,guardControls,selectionControls,geometryPositiveControls:1,geometryNegativeControls:negativeStyles.length,geometryContainmentChecks,textMappingPositiveControls:1,textMappingNegativeControls:2,identityPositiveControls,identityNegativeControls};
}

async function guardSelfTest() {
  const raw={left:10,right:110,top:20,bottom:100,width:100,height:80};
  const scope={selectedSurface:true,display:'block',writingMode:'horizontal-tb',columnCount:'auto',columnWidth:'auto',clientRects:[raw]};
  const scopeResult=await sampleText(null,{surfaceScopeOnly:{raw,scope}});assert.equal(scopeResult.supported,true);
  const scopeMutations=[{selectedSurface:false},{display:'inline'},{display:'inline-block'},{display:'table-cell'},{writingMode:'vertical-rl'},{columnCount:'2'},{columnWidth:'40px'},{clientRects:[]},{clientRects:[raw,raw]},{clientRects:[{...raw,right:109}]},{clientRects:[{...raw,width:NaN}]}];
  for (const mutation of scopeMutations) assert.equal((await sampleText(null,{surfaceScopeOnly:{raw,scope:{...scope,...mutation}}})).supported,false);
  const style={radii:['2px','7px','3px','5px'],borders:['11px','19px','13px','17px'],boxShadow:'none',backgroundClip:'border-box',backgroundImage:'none',borderImageSource:'none'};
  const asymmetric=await sampleText(null,{geometryOnly:{raw,style}});assert.equal(asymmetric.supported,true);assert.deepEqual(asymmetric.safeInterior,{left:27,right:91,top:31,bottom:87,width:64,height:56});
  const empty=await sampleText(null,{geometryOnly:{raw,style:{...style,borders:['45px','60px','45px','60px']}}});assert.equal(empty.supported,false);assert.ok(empty.reasons.includes('empty-safe-interior'));
  const eligibilityCases=[[true,false,[255,255,255,1],true,true],[true,true,[255,255,255,1],true,false],[true,false,[255,255,255,.5],true,false],[true,false,null,true,false],[false,false,[255,255,255,1],true,false],[true,false,[255,255,255,1],false,false]];
  for(const control of eligibilityCases)assert.equal(await sampleText(null,{surfaceEligibilityOnly:control.slice(0,4)}),control[4]);
  const effect={boxShadow:'none',textShadow:'none',filter:'none',backdropFilter:'none',maskImage:'none',clipPath:'none',transform:'none',mixBlendMode:'normal',outlineStyle:'none',outlineWidth:'0px',animationName:'none',transitionDuration:'0s',generatedPseudo:false};
  const boxes=[{left:1000,right:1010,top:0,bottom:20,width:10,height:20}],target={left:0,right:100,top:0,bottom:20};
  const cases=[
    {id:'no-effects',patch:{},expected:true},
    {id:'finite-disjoint-shadow',patch:{boxShadow:'rgb(0, 0, 0) 0px 0px 0px 4px'},expected:true},
    {id:'shadow-offset-crosses-raw-box-gap',patch:{boxShadow:'rgb(0, 0, 0) -1000px 0px 0px 4px'},expected:false,reason:'unrelated-shadow-may-intersect-target'},
    {id:'negative-spread-still-conservative',patch:{boxShadow:'rgb(0, 0, 0) -1000px 0px 0px -2px'},expected:false,reason:'unrelated-shadow-may-intersect-target'},
    {id:'blur-has-no-assumed-bound',patch:{boxShadow:'rgba(24, 35, 49, 0.02) 0px 2px 6px 0px'},expected:false,reason:'unrelated-shadow-extent-unknown'},
    {id:'unknown-shadow',patch:{boxShadow:'unknown'},expected:false,reason:'unrelated-shadow-extent-unknown'},
    {id:'multiple-shadow',patch:{boxShadow:'rgb(0, 0, 0) 0px 0px 0px 1px, rgb(0, 0, 0) 0px 0px 0px 2px'},expected:false,reason:'unrelated-shadow-extent-unknown'},
    {id:'inset-shadow',patch:{boxShadow:'rgb(0, 0, 0) 0px 0px 0px 1px inset'},expected:false,reason:'unrelated-shadow-extent-unknown'},
    {id:'fragmented-shadow',patch:{boxShadow:'rgb(0, 0, 0) 0px 0px 0px 1px'},boxes:[...boxes,...boxes],expected:false,reason:'unrelated-shadow-extent-unknown'},
    {id:'filter',patch:{filter:'drop-shadow(-1000px 0px black)'},expected:false,reason:'unrelated-filter-mask-transform-or-blend-extent-unknown'},
    {id:'backdrop',patch:{backdropFilter:'blur(2px)'},expected:false,reason:'unrelated-filter-mask-transform-or-blend-extent-unknown'},
    {id:'mask',patch:{maskImage:'url(x)'},expected:false,reason:'unrelated-filter-mask-transform-or-blend-extent-unknown'},
    {id:'transform',patch:{transform:'matrix(1,0,0,1,0,0)'},expected:false,reason:'unrelated-filter-mask-transform-or-blend-extent-unknown'},
    {id:'pseudo',patch:{generatedPseudo:true},expected:false,reason:'unrelated-generated-paint-extent-unknown'},
    {id:'text-shadow',patch:{textShadow:'rgb(0, 0, 0) -1000px 0px 2px'},expected:false,reason:'unrelated-text-shadow-extent-unknown'},
    {id:'outline',patch:{outlineStyle:'solid',outlineWidth:'2px'},expected:false,reason:'unrelated-outline-extent-unknown'},
    {id:'animation',patch:{animationName:'move'},expected:false,reason:'unrelated-dynamic-paint'},
    {id:'transition',patch:{transitionDuration:'0s, 1s'},expected:false,reason:'unrelated-dynamic-paint'},
  ];
  for (const control of cases) {const result=await sampleText(null,{outsidePaintOnly:{effect:{...effect,...control.patch},boxes:control.boxes??boxes,target}});assert.equal(result.supported,control.expected,control.id);if(control.reason)assert.ok(result.reasons.includes(control.reason),control.id);}
  return {status:'pass',surfaceScopePositive:1,surfaceScopeNegative:scopeMutations.length,asymmetricBorderDominantPositive:1,emptyInteriorNegative:1,firstOpaqueEligibilityPositive:1,firstOpaqueEligibilityNegative:5,outsidePaintControls:cases.map(({id,expected})=>({id,expected,status:'pass'}))};
}

async function guardBrowserControls(page,save,result) {
  const controls=[
    {id:'single-reviewed-block',expected:'measured-pass'},
    {id:'history-surface-excludes-second-inspector-panel',historyPanels:true,selector:'.reduction-workspace > section.panel:not(.trial-inspector)',expected:'measured-pass'},
    {id:'inline-surface-rejected',surface:'display:inline;',expected:'unresolved',reason:'surface-not-single-ordinary-block'},
    {id:'multicolumn-surface-rejected',surface:'column-count:2;',expected:'unresolved',reason:'surface-not-single-ordinary-block'},
    {id:'surface-outside-explicit-selector',selector:'#missing-surface',expected:'unresolved',reason:'surface-outside-reviewed-scope'},
    {id:'unrelated-finite-shadow-disjoint',extra:'box-shadow:0 0 0 1px black;',expected:'measured-pass'},
    {id:'unrelated-shadow-offset-intersects',extra:'box-shadow:-1000px 0 0 30px black;',expected:'unresolved',reason:'unrelated-shadow-may-intersect-target'},
    {id:'unrelated-blurred-shadow-unbounded',extra:'box-shadow:0 2px 6px #18233105;',expected:'unresolved',reason:'unrelated-shadow-extent-unknown'},
    {id:'unrelated-filter-outside-box',extra:'filter:drop-shadow(-1000px 0 black);',expected:'unresolved',reason:'unrelated-filter-mask-transform-or-blend-extent-unknown'},
    {id:'unrelated-generated-content-outside-box',pseudo:true,expected:'unresolved',reason:'unrelated-generated-paint-extent-unknown'},
  ];
  const observed=[];result.guardBrowserControls=observed;
  for (const control of controls) {
    await page.setContent(`<style>html,body{margin:0;background:white;}body{font:12px/20px Arial;}#surface{display:block;background:white;width:360px;border:1px solid gray;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.2);${control.surface??''}}#scroll{width:288px;overflow:auto;margin:24px;}#wide{width:${control.expected==='measured-pass'?'960':'760'}px;white-space:nowrap;}#target{display:block;color:#182331;}#outside{position:fixed;left:1000px;top:24px;width:1px;height:20px;pointer-events:none;${control.extra??''}}${control.pseudo?'#outside::before{content:"PAINT";position:absolute;left:-1000px;top:0;background:black;color:white;}':''}</style>${control.historyPanels?'<div class="reduction-workspace"><section id="surface" class="panel">':'<div id="surface">'}<div id="scroll"><div id="wide"><span id="target">0123456789abcdef${'0123456789abcdef'.repeat(7)}</span></div></div>${control.historyPanels?'</section><section class="panel trial-inspector"></section></div>':'</div>'}${control.extra||control.pseudo?'<div id="outside"></div>':''}`);
    const before=await page.locator('body').evaluate(el=>el.outerHTML);
    const sampled=await page.locator('#target').evaluate(sampleText,{allowDirectAdjacentText:true,allowOpaqueRoundedSurface:true,surfaceScope:{kind:'synthetic-control',selector:control.selector??'#surface'},maximumCharacters:8192,maximumScrollPositions:12,verifyOccluderEquivalence:true,stopAtPerformanceMs:await page.evaluate(()=>performance.now())+10000});
    observed.push({...control,observed:sampled});await save();
    assert.equal(await page.locator('body').evaluate(el=>el.outerHTML),before,control.id+' exact complete DOM unchanged');
    assert.equal(sampled.status,control.expected,control.id);if(control.reason)assert.ok(sampled.reasons.includes(control.reason),control.id);
    assert.ok(sampled.steps.length>0);for(const step of sampled.steps){assert.equal(step.occluderEquivalence.checked,true);assert.equal(step.occluderEquivalence.equal,true);assert.deepEqual(step.occluderEquivalence.legacyOccluders,step.possibleOccluders);}
    if(control.expected==='measured-pass') assert.ok(sampled.characters.some(c=>c.witness?.stepIndex>0),control.id+' requires real multi-position glyph coverage');
    if(control.historyPanels) {assert.equal(await page.locator('.reduction-workspace > section.panel').count(),2);assert.ok(sampled.steps.every(step=>step.paint.layers.some(layer=>layer.opaqueSurface?.scope?.selectedSurface)));}
    if(control.extra||control.pseudo) {
      assert.ok(sampled.steps.some(step=>step.outsidePaint.some(paint=>paint.owner.id==='outside')),control.id+' inventoried before raw box rejection');
      assert.ok(sampled.steps.every(step=>!step.possibleOccluders.some(paint=>paint.owner.id==='outside')),control.id+' lies outside legacy/optimized raw boxes');
    }
  }
  return observed;
}

// New diagnostics only. Original workload results/controls remain untouched.
export function createWorkloadLifecycleCapture({ lifecycle, resourceProbe, callerSha256, writeSidecar, clock, runtimeVersions = {}, batchId }) {
  const issues=new Set();let validated=false,finished=false,complete=false,started=null;
  const add=code=>issues.add(code);
  const version=value=>typeof value==='string'&&Buffer.byteLength(value)<=128&&/^[\w.+()# -]+$/.test(value)?value:'unavailable';
  const budgetValid=()=>resourceProbe?.sourceSummaryBudget?.sourceMaxBytes===16384&&resourceProbe.sourceSummaryBudget.samplerMetadataMaxBytes===114688&&resourceProbe.sourceSummaryBudget.samplerCombinedMaxBytes===4177920;
  function stamp(){try{const value=clock();if(typeof value.utc!=='string'||value.utc.length>64||!Number.isFinite(Date.parse(value.utc))||typeof value.monoNs!=='bigint'||value.monoNs<0n||value.monoNs.toString().length>24)throw new Error();return {utc:value.utc,monoNs:value.monoNs.toString()};}catch{add('CLOCK_ERROR');return null;}}
  function mark(label,event){try{if(validated)lifecycle.mark(label,event);}catch{add('DIAGNOSTIC_PHASE_FAILED');}}
  function validate(){
    if(!approvedBatchIds.includes(batchId)||resourceProbe?.selected!==true||resourceProbe?.intendedTest!==true||resourceProbe.entrypoint!=='/work/verification-inputs/contrast-p57-approved-batch-probe.mjs'||resourceProbe.ppid!==1||resourceProbe.runnerMode!=='single-script-bounded-pools'||resourceProbe.nodePools?.v8!==1||resourceProbe.nodePools?.libuv!==1||!budgetValid()||!/^[a-f0-9]{64}$/.test(callerSha256??'')||!lifecycle||!['mark','observeClose','summary'].every(key=>typeof lifecycle[key]==='function')){add('PRELOAD_INVALID');throw new Error('LIFECYCLE_PRELOAD_INVALID');}
    validated=true;started=stamp();mark('workload.capture','start');
  }
  function observeClose(label,operation,contextCount){
    // The reviewed helper preserves original operation values/errors. Do not
    // cache, retry, reorder or suppress an original close call.
    if(!validated){add('PRELOAD_INVALID');return operation();}
    return lifecycle.observeClose(label,operation,contextCount);
  }
  async function finish(source){
    if(finished){add('ISSUE_FINISH_REPEATED');complete=false;return {complete:false,status:'diagnostic-capture-incomplete',errors:[...issues]};}
    finished=true;if(!validated)add('PRELOAD_INVALID');
    if(!source||source.batchId!==batchId||!['started','incomplete','error','measured-failure','all-batch-requested-nodes-measured-pass'].includes(source.status)||![0,1].includes(source.expectedExitCode)||!Number.isSafeInteger(source.cleanupErrorCount)||source.cleanupErrorCount<0||source.cleanupErrorCount>128){add('SOURCE_SNAPSHOT_INVALID');}
    if(source?.sourceObservationComplete!==true||!['incomplete','measured-failure','all-batch-requested-nodes-measured-pass'].includes(source?.status)||source?.internalBudgetExpired!==false||source?.cleanupErrorCount!==0)add('SOURCE_WORKLOAD_INCOMPLETE');
    const originalExpectedExitCode=source?.status==='all-batch-requested-nodes-measured-pass'&&source?.cleanupErrorCount===0?0:1;
    if(source?.expectedExitCode!==originalExpectedExitCode)add('SOURCE_EXIT_MISMATCH');
    mark('workload.capture',source?.status==='error'||source?.internalBudgetExpired||source?.cleanupErrorCount?'error':'settled');
    let diagnostic;
    try{diagnostic=lifecycle?.summary();if(!diagnostic||!['complete','incomplete'].includes(diagnostic.status))throw new Error();}
    catch{add('DIAGNOSTIC_SNAPSHOT_FAILED');diagnostic={status:'incomplete',issues:['DIAGNOSTIC_SNAPSHOT_FAILED']};}
    if(diagnostic.status!=='complete')add('DIAGNOSTICS_INCOMPLETE');
    if(!budgetValid()||resourceProbe?.sourceSummaryBudget?.failure)add('SOURCE_BUDGET_INCOMPLETE');
    const ended=stamp();if(started&&ended&&BigInt(ended.monoNs)<BigInt(started.monoNs))add('CLOCK_ERROR');
    const record={schemaVersion:1,scope:'prospective-corrected-css-p57-batch',acceptance:'NOT_EVALUATED',
      closure:'PROVISIONAL_PENDING_SIDECAR_AND_TELEMETRY_IO_AND_EXTERNAL_GATES',
      executedCaller:{file:'verification-inputs/contrast-p57-approved-batch-probe.mjs',sha256:callerSha256},
      originalWorkloadProbeSha256:'9b8f407a554434f793bd93b7cf50cf145adfba828d6660c6b49896fe82da7053',
      historicalVerifiedInputsMeaning:'CANDIDATE_AND_EXECUTED_CALLER_WITH_IMMUTABLE_BASELINE_REFERENCES',
      source:{batchId:source?.batchId===batchId?batchId:null,status:['started','incomplete','error','measured-failure','all-batch-requested-nodes-measured-pass'].includes(source?.status)?source.status:null,sourceObservationComplete:source?.sourceObservationComplete===true,internalBudgetExpired:source?.internalBudgetExpired===true,cleanupErrorCount:Number.isSafeInteger(source?.cleanupErrorCount)&&source.cleanupErrorCount>=0&&source.cleanupErrorCount<=128?source.cleanupErrorCount:null,expectedExitCode:[0,1].includes(source?.expectedExitCode)?source.expectedExitCode:null},
      runtimeVersions:{node:version(runtimeVersions.node),kernelRelease:version(runtimeVersions.kernelRelease),browser:version(source?.browserVersion)},
      started,ended,lifecycleDiagnostics:diagnostic,sourceSummaryBudget:resourceProbe?.sourceSummaryBudget??null,
      observationsComplete:issues.size===0,errors:[...issues]};
    let serialized;
    try{serialized=JSON.stringify(record,null,2)+'\n';}catch{add('SIDECAR_SERIALIZATION_FAILED');}
    if(serialized!==undefined&&Buffer.byteLength(serialized)>16384){add('SIDECAR_BYTE_CAP');serialized=undefined;}
    if(serialized!==undefined)try{await writeSidecar(serialized);complete=issues.size===0;}catch{add('SIDECAR_WRITE_FAILED');}
    return {complete,status:complete?'diagnostic-capture-complete':'diagnostic-capture-incomplete',errors:[...issues]};
  }
  return {validate,mark,observeClose,finish,get captureComplete(){return complete;}};
}
function workloadKernelRelease(){let fd;try{fd=lifecycleOpenSync('/proc/sys/kernel/osrelease','r');const bytes=Buffer.alloc(129);const size=lifecycleReadSync(fd,bytes,0,bytes.length,null);const value=bytes.subarray(0,size).toString('utf8').trim();return size<=128&&/^[\w.+()# -]+$/.test(value)?value:'unavailable';}catch{return 'unavailable';}finally{if(fd!==undefined)try{lifecycleCloseSync(fd);}catch{/* Version I/O is not browser closure evidence. */}}}

async function run() {
  const manifestPath = resolve(process.argv[2]), input = dirname(manifestPath), out = resolve(process.argv[3]);
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  const startedAt = Date.now();
  const batchId=process.argv[4];
  assert.ok(approvedBatchIds.includes(batchId),'One of five exact approved unique batch IDs');
  assert.equal(manifest.batchPlan,'batch-plan.json');assert.equal(manifest.frozenManifest,'frozen-v3-inputs.json');
  const planBytes=await readFile(resolve(input,manifest.batchPlan)),plan=JSON.parse(planBytes);
  validateBatchPlan(manifest,plan);
  const selected=selectBatch(manifest,plan,batchId),executionStates=[selected.state];
  await mkdir(out, { recursive: true });
  const result = { schemaVersion: 1, status: 'started', scope: manifest.scope, manifestSha256: digest(manifestBytes), startedAt: new Date(startedAt).toISOString(),
    browserControlsStatus:'UNRUN', originalAxeResultsModified: false, originalComparatorRecovered: false, nativeZoom: 'unmeasured', screenReader: 'not used', verifiedInputs: [], controls: [], nodes: [], unexpectedRequests: [], pageErrors: [], cleanupErrors: [] };
  result.batch={id:batchId,planSha256:digest(planBytes),assigned:selected.batch.nodes,expectedNodeCount:selected.nodes.length,fullManifestCount:57,globalCompletionClaim:false,acceptance:'PROVISIONAL',externalCleanup:'PENDING_INDEPENDENT_REVIEW'};
  result.sourceObservationComplete=false;
  result.memorySnapshots=[];
  const memory=phase=>{assert.ok(result.memorySnapshots.length<64,'Bounded memory telemetry');const {rss,heapUsed,heapTotal,external,arrayBuffers}=process.memoryUsage();result.memorySnapshots.push({phase,elapsedMs:Date.now()-startedAt,rss,heapUsed,heapTotal,external,arrayBuffers});};
  const evidenceStore=createEvidenceStore(out,result,{batchId,expectedNodeCount:selected.nodes.length});
  const save=()=>evidenceStore.save();
  memory('start');
  let browser,deadlineTimer;
  let lifecycleCapture,lifecycleCaptureComplete=false;
  try {
    lifecycleCapture=createWorkloadLifecycleCapture({batchId,lifecycle:globalThis[Symbol.for('repro.lifecycleDiagnostics')],resourceProbe:globalThis[Symbol.for('repro.resourceProbe')],callerSha256:digest(await readFile(new URL(import.meta.url))),
      clock:()=>({utc:new Date().toISOString(),monoNs:process.hrtime.bigint()}),runtimeVersions:{node:process.version,kernelRelease:workloadKernelRelease()},
      writeSidecar:async serialized=>{const file=join(out,'lifecycle-source.json');await writeFile(file,serialized,{flag:'wx',mode:0o600});const recovered=await readFile(file);if(!recovered.equals(Buffer.from(serialized)))throw new Error('LIFECYCLE_SIDECAR_READBACK_FAILED');}});
    lifecycleCapture.validate();
    result.phaseTimings = {};
    const preflightStarted = Date.now();

    for (const entry of [...manifest.sourceFiles,...manifest.probeSources,...manifest.batchInputFiles]) {
      const path = resolve(input, entry.path); assert.ok(path.startsWith(input + '/'), 'Input path confinement');
      const bytes = await readFile(path); assert.equal(bytes.length, entry.bytes); assert.equal(digest(bytes), entry.sha256, entry.path + ' byte identity'); result.verifiedInputs.push(entry);
    }
    const packet = JSON.parse(await readFile(resolve(input, manifest.packet))), evidence = JSON.parse(await readFile(resolve(input, manifest.evidence)));
    result.pureControls = await supplementalSelfTest(manifest,packet);
    assert.deepEqual(packet, evidence); assert.equal(packet.caseSha256, manifest.caseSha256);
    assert.equal(manifest.revision,'p57-memory-batch-v1');
    const frozenManifestBytes=await readFile(resolve(input,manifest.frozenManifest));
    assert.equal(digest(frozenManifestBytes),plan.frozenManifestSha256);
    const frozenManifest=JSON.parse(frozenManifestBytes);
    verifyCandidateManifest(manifest,frozenManifest);
    const jobs=packet.evidence.jobs.filter(row=>row.job.id===manifest.jobId);assert.equal(jobs.length,1);const job=jobs[0];assert.equal(job.job.sessionId,manifest.sessionId);
    const inventory = JSON.parse(await readFile(resolve(input, manifest.inventory))), comparator = JSON.parse(await readFile(resolve(input, manifest.comparatorSummary)));
    assert.equal(inventory.jobId, manifest.jobId); assert.equal(inventory.caseSha256, manifest.caseSha256);
    assert.deepEqual(manifest.states, inventory.states.filter(s => s.condition === 'P'));
    assert.deepEqual(manifest.states.map(s=>s.nodes.length), [24,33]);
    for (const state of manifest.states) {
      const audit = comparator.audits.find(a=>a.condition==='P'&&a.state===state.auditState);
      const rules = audit.incomplete.filter(r=>r.id==='color-contrast'); assert.equal(rules.length,1); const rule=rules[0];
      assert.equal(rule.nodeCount,state.nodes.length); assert.equal(rule.omittedNodes,0);
      assert.deepEqual(state.nodes.map(n=>n.sourceAuditNodeIndex),rule.nodes.map((_,i)=>i));
      for (const node of state.nodes) { const original=rule.nodes[node.sourceAuditNodeIndex]; assert.deepEqual(node.target,original.target); assert.equal(node.originalHtml,original.html); }
    }
    result.phaseTimings.preflightMs = Date.now() - preflightStarted;
    const launchStarted = Date.now();
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    browser.on('disconnected',()=>lifecycleCapture.mark('browser.disconnected','event'));
    deadlineTimer=setTimeout(()=>{result.internalBudgetExpired=true;lifecycleCapture.mark('deadline','event');void lifecycleCapture.observeClose('deadline.browser.close',()=>browser.close(),()=>browser.contexts().length).catch(error=>result.cleanupErrors.push(error.message));},Math.max(0,manifest.stopAfterElapsedMs-(Date.now()-startedAt)));
    result.browserVersion = browser.version(); result.phaseTimings.launchMs = Date.now() - launchStarted;
    result.browserControlsStatus='RUNNING';
    // These independent synthetic controls validate the sampler, not the product.
    const controls = [
      { id: 'wide-pass', foreground: '#182331', expected: 'measured-pass' },
      { id: 'wide-low-contrast', foreground: '#ffffff', expected: 'measured-fail' },
      { id: 'opacity-unsupported', foreground: '#182331', ancestor: 'opacity:0.5;', expected: 'unresolved' },
      { id: 'gradient-unsupported', foreground: '#182331', ancestor: 'background-image:linear-gradient(white,black);', expected: 'unresolved' },
      { id: 'pointer-events-none-overlay', foreground: '#182331', overlay: true, expected: 'unresolved' },
      { id: 'inadequate-scroll-budget', foreground: '#182331', positions: 1, expected: 'unresolved' },
    ];
    const context = await browser.newContext({ viewport: {width:390,height:900}, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      result.screenshotControls = [];
      const screenshotFixture = '<input id="caret" value="probe">';
      for (const caret of ['default', 'initial']) {
        const controlStarted = Date.now();
        await page.setContent(screenshotFixture);
        const before = await page.locator('body').evaluate(el => el.outerHTML);
        assert.equal(before, '<body><input id="caret" value="probe"></body>', 'Each screenshot control starts with the exact pristine fixture');
        assert.equal(await page.locator('#caret').getAttribute('style'), null, 'Neither screenshot control starts with a style attribute');
        await page.evaluate(() => {
          window.__screenshotMutations = [];
          window.__screenshotObserver = new MutationObserver(records => window.__screenshotMutations.push(...records.map(record => ({ id: record.target.id, type: record.type, attributeName: record.attributeName, oldValue: record.oldValue, currentValue: record.target.getAttribute(record.attributeName) }))));
          window.__screenshotObserver.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
        });
        const filename = `screenshot-control-${caret}.png`;
        const bytes = await page.screenshot({ path: join(out, filename), ...(caret === 'initial' ? { caret: 'initial' } : {}) });
        const after = await page.locator('body').evaluate(el => el.outerHTML);
        const mutations = await page.evaluate(() => { window.__screenshotObserver.disconnect(); return window.__screenshotMutations; });
        const entry = { id: `screenshot-${caret}`, before, after, beforeSha256: digest(before), afterSha256: digest(after), mutations, durationMs: Date.now() - controlStarted,
          screenshot: { file: filename, sha256: digest(bytes), bytes: bytes.length }, expected: caret === 'default' ? 'one-empty-style-attribute-added' : 'exact-body-unchanged' };
        result.screenshotControls.push(entry); await save();
        if (caret === 'default') {
          assert.equal(before, '<body><input id="caret" value="probe"></body>');
          assert.equal(after, '<body><input id="caret" value="probe" style=""></body>', 'Default screenshot reproduces exact empty-style mutation');
          assert.ok(mutations.some(record => record.id === 'caret' && record.attributeName === 'style'));
        } else { assert.equal(after, before, 'Explicit initial caret preserves complete DOM'); assert.equal(mutations.length, 0, 'No screenshot attribute/content mutation'); }
        entry.status = 'expected-observation';
      }
      const samplerControlsStarted = Date.now();
      for (const control of controls) {
        await page.setContent(`<style>html,body{margin:0;background:white;}body{font:12px/20px Arial;}#scroll{width:288px;overflow:auto;margin:16px;}table{border-collapse:collapse;}td{padding:9px;min-width:760px;white-space:nowrap;}#target{color:${control.foreground}}#surface{background:white;${control.ancestor ?? ''}}</style><div id="surface"><div id="scroll"><table><tr><td id="target">${'0123456789abcdef'.repeat(8)}</td></tr></table></div></div>${control.overlay ? '<div style="position:fixed;inset:0;background:white;pointer-events:none;z-index:9999"></div>' : ''}`);
        const sampled = await page.locator('#target').evaluate(sampleText, { maximumCharacters: 8192, maximumScrollPositions: control.positions ?? 12, verifyOccluderEquivalence: true, stopAtPerformanceMs: await page.evaluate(() => performance.now()) + 10000 });
        result.controls.push({ ...control, observed: sampled }); await save();
        if (control.id !== 'inadequate-scroll-budget') assert.ok(sampled.steps.length > 0, control.id + ' executes occluder comparisons');
        for (const step of sampled.steps) {
          assert.equal(step.occluderEquivalence.checked, true, control.id + ' checks legacy/optimized occluders');
          assert.equal(step.occluderEquivalence.equal, true, control.id + ' exact occluder-list equivalence');
          assert.deepEqual(step.occluderEquivalence.legacyOccluders, step.possibleOccluders, control.id + ' independently compare full occluder lists');
        }
        assert.equal(sampled.status, control.expected, control.id + ' sampler control');
        if (control.id === 'wide-pass') assert.ok(sampled.characters.some(c => c.witness.stepIndex > 0), 'Control needs real multi-position coverage');
      }
      const surfaceControls = [
        {id:'adjacent-text-boundary',adjacent:true,expected:'measured-pass'},
        {id:'nested-element-rejected',nested:true,expected:'unresolved',reason:'exact-single-text-node-required'},
        {id:'rounded-outset-safe-interior',surface:'border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.2);',expected:'measured-pass'},
        {id:'rounded-unsafe-corner',surface:'border-radius:10px;',unsafe:true,expected:'unresolved',reason:'incomplete-character-coverage'},
        {id:'inset-shadow-rejected',surface:'border-radius:12px;box-shadow:inset 0 1px 2px rgba(0,0,0,.2);',expected:'unresolved',reason:'shadow-paint'},
        {id:'multiple-shadow-rejected',surface:'border-radius:12px;box-shadow:0 1px 2px black,0 2px 3px gray;',expected:'unresolved',reason:'shadow-paint'},
        {id:'percent-radius-rejected',surface:'border-radius:10%;',expected:'unresolved',reason:'rounded-background'},
        {id:'elliptic-radius-rejected',surface:'border-radius:12px / 6px;',expected:'unresolved',reason:'rounded-background'},
        {id:'adjacent-tight-edge-incomplete-coverage',adjacent:true,tightEdge:true,expected:'unresolved',reason:'incomplete-character-coverage'},
      ];
      result.surfaceControls=[];
      for (const control of surfaceControls) {
        await page.setContent(`<style>html,body{margin:0;background:white;}body{font:12px/20px Arial;}#surface{background:white;width:360px;border:1px solid gray;${control.surface??''}}#scroll{width:288px;overflow:auto;margin:${control.unsafe?'0':'24px'};}#wide{width:${control.expected==='measured-pass'?'960':'760'}px;padding:0;white-space:nowrap;}#target{display:block;color:#182331;}</style><div id="surface"><div id="scroll"><div id="wide"><span id="target">${control.unsafe?'CORNER':'12 ms '+ '0123456789abcdef'.repeat(8)}</span></div></div></div>`);
        if (control.adjacent) await page.locator('#target').evaluate(el=>{const text=el.textContent;el.replaceChildren(document.createTextNode(text.slice(0,2)),document.createTextNode(text.slice(2)));});
        if (control.nested) await page.locator('#target').evaluate(el=>{const child=document.createElement('b');child.textContent=el.textContent;el.replaceChildren(child);});
        const before=await page.locator('body').evaluate(el=>el.outerHTML);
        const sampled=await page.locator('#target').evaluate(sampleText,{allowDirectAdjacentText:true,allowOpaqueRoundedSurface:true,surfaceScope:{kind:'synthetic-control',selector:'#surface'},maximumCharacters:8192,maximumScrollPositions:12,verifyOccluderEquivalence:true,stopAtPerformanceMs:await page.evaluate(()=>performance.now())+10000});
        result.surfaceControls.push({...control,observed:sampled});await save();
        if (control.tightEdge) {
          // Capture the missing terminal Range at the sampler's unchanged final scroll.
          // This is new diagnostic evidence; v2 did not retain the rejected Range box.
          const terminalRange=await page.locator('#target').evaluate(el=>{
            const box=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
            const textNode=el.childNodes[1],range=document.createRange();range.setStart(textNode,131);range.setEnd(textNode,132);
            const scroller=document.querySelector('#scroll');
            return {text:range.toString(),textNodeIndex:1,textNodeOffset:131,globalOffset:133,
              clientRects:[...range.getClientRects()].map(box),boundingRect:box(range.getBoundingClientRect()),
              scroll:{left:scroller.scrollLeft,top:scroller.scrollTop,scrollWidth:scroller.scrollWidth,clientWidth:scroller.clientWidth},
              windowScroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight}};
          });
          terminalRange.sampledClip=sampled.steps.at(-1).clip;
          terminalRange.outsideEdges=terminalRange.clientRects.map(box=>Object.entries({left:box.left<terminalRange.sampledClip.left,right:box.right>terminalRange.sampledClip.right,top:box.top<terminalRange.sampledClip.top,bottom:box.bottom>terminalRange.sampledClip.bottom}).filter(([,outside])=>outside).map(([edge])=>edge));
          result.surfaceControls.at(-1).rejectedTerminalRange=terminalRange;await save();
        }
        assert.equal(await page.locator('body').evaluate(el=>el.outerHTML),before,control.id+' exact complete DOM unchanged');
        assert.equal(sampled.status,control.expected,control.id);
        if (control.reason) assert.ok(sampled.reasons.includes(control.reason),control.id+' specific rejection');
        if (!control.nested) assert.ok(sampled.steps.length>0,control.id+' executes occluder comparisons');
        for (const step of sampled.steps) { assert.equal(step.occluderEquivalence.checked,true);assert.equal(step.occluderEquivalence.equal,true);assert.deepEqual(step.occluderEquivalence.legacyOccluders,step.possibleOccluders); }
        if (control.adjacent) {assert.equal(sampled.textNodeMapping.length,2);assert.ok(sampled.characters.some(c=>c.textNodeIndex===0&&c.witness));assert.ok(sampled.characters.some(c=>c.textNodeIndex===1&&c.witness));}
        if (control.id==='rounded-outset-safe-interior') assert.ok(sampled.steps.every(step=>step.paint.layers.some(layer=>layer.opaqueSurface?.supported)));
        if (control.unsafe) assert.ok(sampled.steps.some(step=>step.backgroundAreaRejected>0),'Unsafe corner is rejected by actual range/background bounds');
        if (control.expected==='measured-pass') assert.ok(sampled.characters.some(c=>c.witness?.stepIndex>0),control.id+' requires real multi-position glyph coverage');
        if (control.tightEdge) {
          assert.equal(sampled.text,'12 ms '+'0123456789abcdef'.repeat(8));
          assert.deepEqual(sampled.textNodeMapping,[{nodeIndex:0,start:0,end:2,data:'12'},{nodeIndex:1,start:2,end:134,data:' ms '+'0123456789abcdef'.repeat(8)}]);
          assert.deepEqual(sampled.reasons,['incomplete-character-coverage']);assert.equal(sampled.totalCharacters,132);assert.equal(sampled.coveredCharacters,131);
          assert.deepEqual(sampled.uncoveredOffsets,[133]);assert.deepEqual(sampled.unsupportedOffsets,[]);
          assert.deepEqual(sampled.characters.at(-1),{offset:133,textNodeIndex:1,textNodeOffset:131,character:'f',witness:null});
          assert.deepEqual(sampled.plannedScrollPositions,[0,144,288,432,570]);
          const last=sampled.steps.at(-1),terminalRange=result.surfaceControls.at(-1).rejectedTerminalRange;
          assert.equal(last.actualScrollLeft,570);assert.equal(last.scrollWidth,858);assert.equal(last.clientWidth,288);
          assert.deepEqual(last.clip,{left:25,top:25,right:313,bottom:45});assert.equal(last.outsideClip,1);
          for(const step of sampled.steps){assert.deepEqual(step.paint.issues,[]);assert.ok(step.outsidePaint.every(effect=>effect.supported));assert.deepEqual(step.possibleOccluders,[]);for(const counter of ['hitTestRejected','overlapRejected','backgroundAreaRejected','noRangeRect'])assert.equal(step[counter],0);}
          assert.equal(terminalRange.text,'f');assert.equal(terminalRange.scroll.left,last.actualScrollLeft);assert.equal(terminalRange.scroll.scrollWidth,last.scrollWidth);assert.equal(terminalRange.scroll.clientWidth,last.clientWidth);
          assert.deepEqual(terminalRange.windowScroll,last.windowScroll);assert.deepEqual(terminalRange.viewport,last.viewport);
          assert.ok(terminalRange.clientRects.length>0);assert.ok(terminalRange.outsideEdges.some(edges=>edges.length>0),'Direct terminal Range is outside the unchanged recorded clip');
        }
      }
      result.guardBrowserControls=await guardBrowserControls(page,save,result);
      result.selectionBrowserControls=await runSelectionBrowserControls(page,manifest,manifest.states[0],packet);
      result.phaseTimings.samplerControlsMs = Date.now() - samplerControlsStarted;
    } finally { await lifecycleCapture.observeClose('controls.context.close',()=>context.close(),()=>browser.contexts().length); }
    result.browserControlCounts={screenshots:result.screenshotControls.length,sampler:result.controls.length,surface:result.surfaceControls.length,guards:result.guardBrowserControls.length,selection:result.selectionBrowserControls.controls.length};
    assert.deepEqual(result.browserControlCounts,{screenshots:2,sampler:6,surface:9,guards:10,selection:23});
    result.browserControlCounts.total=Object.values(result.browserControlCounts).reduce((sum,count)=>sum+count,0);
    assert.equal(result.browserControlCounts.total,manifest.syntheticFixtureRevision.totalBrowserControls);assert.equal(result.browserControlCounts.total,50);
    result.browserControlsStatus='PASS';
    await evidenceStore.archiveControls();memory('controls-archived');
    result.states=[];
    for (const state of executionStates) {
      const stateResult={id:state.id,viewport:state.viewport,nodes:[],status:'started'}; result.states.push(stateResult);
      const product = await browser.newContext({ viewport: state.viewport, reducedMotion: 'reduce' });
      product.on('request', request => { if (/^https?:/.test(request.url()) || request.method() !== 'GET') result.unexpectedRequests.push({ url: request.url(), method: request.method() }); });
      await product.route(new RegExp('^https?://'), route => route.abort('blockedbyclient'));
      try {
        const page=await product.newPage();page.setDefaultTimeout(3000);page.on('pageerror',error=>result.pageErrors.push(error.message));
        const productStarted=Date.now();
        await page.goto(pathToFileURL(resolve(input,manifest.file)).href+manifest.route);
        await page.getByRole('region',{name:'Trial evidence',exact:true}).waitFor();
        assert.deepEqual(JSON.parse(await page.locator('#hci-evidence').textContent()),packet,'Exact frozen packet embedded in unchanged HTML');
        assert.equal(await page.locator('#root').getAttribute('data-condition'),'P');assert.equal(await page.evaluate(()=>location.hash),manifest.route);
        assert.equal(await page.locator('.rejected-trials').getAttribute('open'),'');
        assert.equal(await page.locator('[aria-label="Reduction trials"] tbody > tr').count(),job.job.result.trials.length);
        const inspector=page.locator('.trial-inspector[aria-label="Trial evidence"]');
        await inspector.locator('[role="status"]').filter({hasText:`Trial ${state.selectedTrial} evidence available.`}).waitFor();
        stateResult.selectionBefore=checkSelectionSnapshot(await page.evaluate(readSelectionSnapshot),manifest,state,packet);
        const outsidePaintInventory=await page.locator('body').evaluate(sampleText,{captureOutsidePaintInventoryOnly:true});
        assert.equal(digest(JSON.stringify(outsidePaintInventory.styles)),manifest.paintScope.stylesSha256,'Exact reviewed frozen stylesheet');
        assert.equal(outsidePaintInventory.externalStylesheets,0);assert.equal(outsidePaintInventory.inlineStyledElements,0);
        stateResult.outsidePaintInventory=outsidePaintInventory;
        const beforeDOM=await page.locator('body').evaluate(el=>el.outerHTML);
        const beforeFile=`${state.id}-body-before.html`;await writeFile(join(out,beforeFile),beforeDOM);stateResult.bodyBeforeArtifact={file:beforeFile,sha256:digest(beforeDOM),bytes:Buffer.byteLength(beforeDOM)};
        memory('product-before');
        for (const node of selected.nodes) {
          if (Date.now()-startedAt>manifest.stopAfterElapsedMs) break;
          memory('node-'+node.sourceAuditNodeIndex+'-before');
          const nodeStarted=Date.now(),row={state:state.id,sourceAuditNodeIndex:node.sourceAuditNodeIndex,target:node.target,originalHtml:node.originalHtml,originalStatus:'axe-incomplete',status:'unresolved'};
          result.nodes.push(row);stateResult.nodes.push({sourceAuditNodeIndex:node.sourceAuditNodeIndex,resultIndex:result.nodes.length-1});await save();
          try {
            assert.equal(node.target.length,1);const locator=page.locator(node.target[0]);assert.equal(await locator.count(),1,'Exact unique original selector');
            const observed=await locator.evaluate(el=>{const cell=el.closest('td'),row=el.closest('tr');return {tag:el.tagName,attributes:[...el.attributes].map(a=>[a.name,a.value]),childElementCount:el.childElementCount,textNodes:[...el.childNodes].map(n=>n.data),nodeTypes:[...el.childNodes].map(n=>n.nodeType),text:el.textContent,outerHTML:el.outerHTML,trialButton:row.querySelector('button.trial-select')?.textContent,rowIndex:row.sectionRowIndex+1,columnIndex:cell.cellIndex+1,group:el.closest('.rejected-trials')?'rejected':'kept',region:el.closest('[role="region"]')?.getAttribute('aria-label')};});
            row.identity=checkTrialIdentity(observed,node,job);
            const measurementStarted=Date.now();
            Object.assign(row,await locator.evaluate(sampleText,{allowDirectAdjacentText:true,allowOpaqueRoundedSurface:true,surfaceScope:manifest.paintScope.surface,outsidePaintInventory,verifyOccluderEquivalence:node.sourceAuditNodeIndex===0||node.field==='duration',maximumCharacters:manifest.maximumCharacters,maximumScrollPositions:manifest.maximumScrollPositions,stopAtPerformanceMs:await page.evaluate(()=>performance.now())+Math.max(0,manifest.stopAfterElapsedMs-(Date.now()-startedAt))}));
            row.measurementDurationMs=Date.now()-measurementStarted;
            const after=await locator.evaluate(el=>({outerHTML:el.outerHTML,text:el.textContent,textNodes:[...el.childNodes].map(n=>n.data),nodeTypes:[...el.childNodes].map(n=>n.nodeType)}));
            assert.equal(after.outerHTML,observed.outerHTML);assert.equal(after.text,row.identity.text);assert.deepEqual(after.textNodes,observed.textNodes);assert.deepEqual(after.nodeTypes,observed.nodeTypes);
            row.afterOuterHtmlSha256=digest(after.outerHTML);row.afterTextSha256=digest(after.text);
            for (const step of row.steps??[]) if (step.occluderEquivalence.checked) {assert.equal(step.occluderEquivalence.equal,true);assert.deepEqual(step.occluderEquivalence.legacyOccluders,step.possibleOccluders);}
            if (node.sourceAuditNodeIndex===0||node.field==='duration'&&node.sourceAuditNodeIndex===6) {const filename=`${state.id}-node-${node.sourceAuditNodeIndex}.png`,bytes=await page.screenshot({path:join(out,filename),caret:'initial'});row.screenshot={file:filename,sha256:digest(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
            row.productChecksCompleted=true;
          } catch(error) {row.status='unresolved';row.error=error.message;}
          row.nodeDurationMs=Date.now()-nodeStarted;await save();memory('node-'+node.sourceAuditNodeIndex+'-archived');
        }
        const afterDOM=await page.locator('body').evaluate(el=>el.outerHTML),afterFile=`${state.id}-body-after.html`;await writeFile(join(out,afterFile),afterDOM);stateResult.bodyAfterArtifact={file:afterFile,sha256:digest(afterDOM),bytes:Buffer.byteLength(afterDOM)};
        stateResult.selectionAfter=checkSelectionSnapshot(await page.evaluate(readSelectionSnapshot),manifest,state,packet);
        assert.deepEqual(stateResult.selectionAfter,stateResult.selectionBefore,'Exact rendered selection and inspector preserved');
        assert.equal(digest(JSON.stringify(await page.locator('style').allTextContents())),manifest.paintScope.stylesSha256);
        stateResult.productTotalMs=Date.now()-productStarted;
        assert.equal(afterDOM,beforeDOM,'Product DOM unchanged by scroll-only measurement');stateResult.status='exact-dom-preserved';
        assert.equal(stateResult.nodes.length,selected.nodes.length,'Every assigned occurrence started');
        assert.equal(result.nodes.filter(row=>row.productChecksCompleted===true&&row.artifact).length,selected.nodes.length,'Every assigned occurrence fully checked and archived');
      } finally {await lifecycleCapture.observeClose('product.context.close',()=>product.close(),()=>browser.contexts().length);}
    }
    await save();
    assert.equal(result.states.length,1);assert.ok(result.states.every(state=>state.status==='exact-dom-preserved'));
    assert.equal(result.checkpointCounts.completed,selected.nodes.length);
    assert.equal(result.checkpointCounts.productChecksCompleted,selected.nodes.length);
    result.completedStateCount=result.states.filter(state=>state.status==='exact-dom-preserved').length;
    assertBatchSourceComplete(result,selected);result.sourceObservationComplete=true;
    result.status = result.counts['measured-fail'] ? 'measured-failure' : result.counts.unresolved || !result.sourceObservationComplete ? 'incomplete' : 'all-batch-requested-nodes-measured-pass';
  } catch (error) { result.status = 'error'; result.error = error.message; }
  finally {
    clearTimeout(deadlineTimer);
    if(result.browserControlsStatus==='RUNNING')result.browserControlsStatus='INCOMPLETE';
    result.completedStateCount=(result.states??[]).filter(state=>state.status==='exact-dom-preserved').length;
    if (browser) try { await lifecycleCapture.observeClose('final.browser.close',()=>browser.close(),()=>browser.contexts().length); } catch (error) { result.cleanupErrors.push(error.message); }
    if(result.internalBudgetExpired){result.status='incomplete';result.error='internal-time-budget';}
    if(result.cleanupErrors.length||result.internalBudgetExpired||result.status==='error')result.sourceObservationComplete=false;
    result.batch.externalCleanup='PENDING_INDEPENDENT_REVIEW';result.batch.acceptance='PROVISIONAL';
    memory('finished');
    result.durationMs = Date.now() - startedAt; result.finishedAt = new Date().toISOString(); await save();
    if(lifecycleCapture)lifecycleCaptureComplete=(await lifecycleCapture.finish({batchId,status:result.status,sourceObservationComplete:result.sourceObservationComplete,internalBudgetExpired:result.internalBudgetExpired===true,cleanupErrorCount:result.cleanupErrors.length,expectedExitCode:result.status!=='all-batch-requested-nodes-measured-pass'||result.cleanupErrors.length?1:0,browserVersion:result.browserVersion})).complete;
  }
  console.log(JSON.stringify({ status: result.status, counts: result.counts, durationMs: result.durationMs, summary: join(out, 'summary.json') }));
  if (result.status !== 'all-batch-requested-nodes-measured-pass' || result.cleanupErrors.length) process.exitCode = 1;
  if(!lifecycleCaptureComplete)process.exitCode=86;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--self-test') {
    const manifestPath=resolve(process.argv[3]);const manifest=JSON.parse(await readFile(manifestPath));const packet=JSON.parse(await readFile(resolve(dirname(manifestPath),manifest.packet)));
    console.log(JSON.stringify(await supplementalSelfTest(manifest,packet), null, 2));
  }
  else await run();
}
