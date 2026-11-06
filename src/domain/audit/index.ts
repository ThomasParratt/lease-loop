// The audit chain: canonical JSON, the row hash and the verifier (docs/features/audit-chain.md).
export { canonicalJson } from './canonical';
export {
  GENESIS_HASH,
  hashAuditEntry,
  verifyAuditChain,
  type AuditChainBreak,
  type AuditChainEntry,
  type AuditChainHead,
  type AuditChainRow,
  type AuditChainVerdict,
} from './chain';
