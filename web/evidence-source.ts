import type { CaseJob, HciCasePacket } from '../scripts/hci-case.js';
import type { TrialEvidence } from '../src/evidence-inspector.js';

export type TrialReader = (jobId: string, trialIndex: number) => Promise<TrialEvidence>;
export const studySections = ['overview', 'timeline', 'dependencies', 'reduction', 'comparison', 'export'] as const;
export type StudySection = typeof studySections[number];
export interface StudyRoute { sessionId: string; section: StudySection; jobId: string; trialIndex: number | null }
export const SYNTHETIC_INVALID_JOB = 'hci-synthetic-invalid-locator';

/** This source receives an already validated, projected packet from the node builder.
 * It has no live source, transport, credentials, timer, or mutation fallback. */
export function frozenSource(packet: HciCasePacket) {
  const evidence = packet.evidence;
  return {
    packet,
    select(route: StudyRoute): CaseJob | null {
      return route.sessionId === evidence.session.id ? evidence.jobs.find(row => row.job.id === route.jobId) ?? null : null;
    },
    readTrial: (async (jobId: string, trialIndex: number) => {
      const row = evidence.jobs.find(item => item.job.id === jobId);
      const trial = row?.trials.find(item => item.trialIndex === trialIndex);
      if (!trial) throw new Error('INCONCLUSIVE · NOT_FOUND: The requested trial is not in this frozen evidence packet.');
      return trial;
    }) satisfies TrialReader,
  };
}

export function studyHref(route: StudyRoute): string {
  return `#/sessions/${encodeURIComponent(route.sessionId)}/${route.section}?run=${encodeURIComponent(route.jobId)}${route.trialIndex === null ? '' : `&trial=${route.trialIndex}`}`;
}
export function studyRoute(hash: string, packet: HciCasePacket): StudyRoute {
  const fallback = { sessionId: packet.evidence.session.id, section: 'overview' as const, jobId: packet.evidence.defaultJobId, trialIndex: null };
  if (!hash || hash === '#') return fallback;
  const match = /^#\/sessions\/([^/?]+)\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return { ...fallback, sessionId: 'invalid-explicit-route', jobId: 'invalid-explicit-route' };
  const params = new URLSearchParams(match[3] ?? '');
  const rawTrial = params.get('trial');
  const section = studySections.includes(match[2] as StudySection) ? match[2] as StudySection : 'overview';
  // Invalid explicit locators never silently select a different saved job.
  const jobId = params.has('run') ? params.get('run')! : packet.evidence.defaultJobId;
  let sessionId: string;
  try { sessionId = decodeURIComponent(match[1]!); } catch { sessionId = 'invalid-explicit-route'; }
  return { sessionId, section, jobId, trialIndex: rawTrial === null ? null : /^\d{1,6}$/.test(rawTrial) ? Number(rawTrial) : -1 };
}

export interface EvidenceFact { path: string; value: string; jobId: string | null; trialIndex: number | null }
/** Same complete leaf index in both conditions, including nulls and empty arrays. */
export function evidenceFacts(packet: HciCasePacket): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  function walk(value: unknown, path: string, jobId: string | null, trialIndex: number | null): void {
    if (value !== null && typeof value === 'object' && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value)) {
        const nextJob = path === '/evidence/jobs' ? packet.evidence.jobs[Number(key)]?.job.id ?? null : jobId;
        const nextTrial = /^\/evidence\/jobs\/\d+\/trials$/.test(path) ? Number(key) : trialIndex;
        walk(child, `${path}/${key}`, nextJob, nextTrial);
      }
    } else facts.push({ path, value: value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value), jobId, trialIndex });
  }
  walk(packet, '', null, null);
  return facts;
}
