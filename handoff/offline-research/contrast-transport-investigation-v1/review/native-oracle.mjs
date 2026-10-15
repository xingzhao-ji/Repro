import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('../../contrast-p57-approved-execution-v1/runtime/p390-00-11/input/node_modules/playwright-core/lib/coreBundle.js', import.meta.url));
const text = readFileSync(path, 'utf8');
const start = text.indexOf('// packages/isomorphic/utilityScriptSerializers.ts\nfunction isRegExp5(');
const end = text.indexOf('var init_utilityScriptSerializers = __esm(', start);
if (start < 0 || end < start) throw new Error('Exact staged serializer markers absent');
const extracted = text.slice(start, end);
const setup = `kFunctionBindingPrefix = '__pw_fn_'; kBindingsControllerProperty = '__playwright__binding__controller__'; typedArrayConstructors={i8:Int8Array,ui8:Uint8Array,ui8c:Uint8ClampedArray,i16:Int16Array,ui16:Uint16Array,i32:Int32Array,ui32:Uint32Array,f32:Float32Array,f64:Float64Array,bi64:BigInt64Array,bui64:BigUint64Array}; return {serializeAsCallArgument,parseEvaluationResultValue};`;
// Evaluation of the exact local pure serializer functions. This does not import
// Playwright, create a browser, access a network, or execute a container.
const { serializeAsCallArgument, parseEvaluationResultValue } = new Function(extracted + setup)();
export const nativeBinding = { path, bundleSha256: createHash('sha256').update(text).digest('hex'), excerptSha256: createHash('sha256').update(extracted).digest('hex'), excerptBytes:Buffer.byteLength(extracted) };
export const nativeEncode = value => serializeAsCallArgument(value, v => ({ fallThrough: v }));
export const nativeDecode = value => parseEvaluationResultValue(value);
export const nativeRoundtrip = value => nativeDecode(JSON.parse(JSON.stringify(nativeEncode(value))));
