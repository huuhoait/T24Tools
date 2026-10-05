// Header tabs: [tab id, label]. Ids key App state and ?tool= deep links (the Log Analyzer's
// standalone bridge opens ../?tool=ofs), so rename labels, never ids.
export const NAV_TABS = [
  ['routine', 'Routine Creator'],
  ['builder', 'Routine Builder'],
  ['artefact', 'Artefact Generator'],
  ['ofs', 'OFS Message Generator'],
  ['log', 'T24 Log Analyzer'],
  ['json', 'JSON Viewer'],
];

const TAB_IDS = NAV_TABS.map(([id]) => id);

export function initialTab(search = globalThis.location?.search || '') {
  const tool = new URLSearchParams(search).get('tool') || '';
  return TAB_IDS.includes(tool) ? tool : 'routine';
}
