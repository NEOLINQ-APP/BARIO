// Split out from lib/legal.ts so this constant can be imported from client
// components (e.g. the order form's acceptance checkbox) without pulling in
// node:crypto, which lib/legal.ts needs for recordLegalAcceptance but can't
// be bundled into browser JS.
export const CURRENT_VPS_POLICY_VERSION = '2026-07-28'
