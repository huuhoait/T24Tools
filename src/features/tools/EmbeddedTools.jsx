import { useEffect, useRef } from 'react';

const BASE_URL = import.meta.env.BASE_URL || '/';

// Embedded tools run in an opaque-origin sandbox: scripts may run, but they cannot read T24Tools'
// storage or navigate the app. They talk to us through t24tools-bridge.js.
const SANDBOX = 'allow-scripts allow-downloads allow-modals allow-forms';
export const BRIDGE_KEYS = ['t24tools.ofs.config', 't24tools.t24.ofsContext'];
const MAX_VALUE_LENGTH = 1_000_000;

function storageSnapshot(storage) {
  const values = {};
  for (const key of BRIDGE_KEYS) {
    try {
      const v = storage.getItem(key);
      if (v !== null) values[key] = v;
    } catch {}
  }
  return values;
}

/** Handles one bridge message. Exported for unit tests. Returns true when the message was accepted. */
export function handleBridgeMessage(
  data,
  { reply, onOpenTool, storage = globalThis.localStorage },
) {
  if (!data || typeof data !== 'object') return false;
  switch (data.type) {
    case 't24tools:bridge-ready':
      reply({ type: 't24tools:storage-snapshot', values: storageSnapshot(storage) });
      return true;
    case 't24tools:storage-set':
      if (!BRIDGE_KEYS.includes(data.key) || typeof data.value !== 'string') return false;
      if (data.value.length > MAX_VALUE_LENGTH) return false;
      storage.setItem(data.key, data.value);
      return true;
    case 't24tools:storage-remove':
      if (!BRIDGE_KEYS.includes(data.key)) return false;
      storage.removeItem(data.key);
      return true;
    case 't24tools:open-tool':
      if (data.tool !== 'ofs') return false;
      onOpenTool?.('ofs');
      return true;
    default:
      return false;
  }
}

export function SandboxedTool({ title, file, onOpenTool }) {
  const ref = useRef(null);
  useEffect(() => {
    function onMessage(event) {
      const frame = ref.current?.contentWindow;
      // Only our own sandboxed frame (opaque origin "null") may use the bridge.
      if (!frame || event.source !== frame || event.origin !== 'null') return;
      handleBridgeMessage(event.data, {
        reply: (message) => frame.postMessage(message, '*'),
        onOpenTool,
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onOpenTool]);
  return (
    <div className="embedded-tool">
      <iframe
        ref={ref}
        title={title}
        src={BASE_URL + 'tools/' + file}
        sandbox={SANDBOX}
        allow="clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function OFSGenerator() {
  return (
    <section className="workspace-category">
      <div className="head">
        <div>
          <h1>📨 OFS Message Generator</h1>
          <small>
            Build, parse and inspect Temenos OFS messages. Settings are saved in this browser only.
          </small>
        </div>
      </div>
      <SandboxedTool title="OFS Generator" file="ofsMessageGenNew.html" />
    </section>
  );
}

export function LogAnalyzer({ onOpenTool }) {
  return (
    <section className="workspace-category">
      <div className="head">
        <div>
          <h1>📋 T24 Log Analyzer</h1>
          <small>
            Read T24 / TAFJ log files, filter entries and send an OFS message straight to the OFS
            Message Generator. Logs never leave the browser.
          </small>
        </div>
      </div>
      <SandboxedTool
        title="T24 Log Analyzer"
        file="t24_logMultiFile.html"
        onOpenTool={onOpenTool}
      />
    </section>
  );
}
