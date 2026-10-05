// The one knowledge store of the app: a release loaded in any tool is seen by all of them (also
// when the browser blocks storage and the file is kept for the session only).

import { createKnowledgeStore } from '../features/artefactGenerator/knowledgeStore';
import { siteKnowledgePath } from './siteKnowledge';

export const knowledgeStore = createKnowledgeStore();

/** Same-origin URL of a release published with the site (see src/build/knowledgeFiles.js). */
export function siteKnowledgeUrl(release, file) {
  return import.meta.env.BASE_URL + siteKnowledgePath(release, file);
}
