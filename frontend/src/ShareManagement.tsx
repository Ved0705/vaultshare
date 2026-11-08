import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, ShieldOff, Users } from "lucide-react";
import { api, type VaultShare } from "./api";
import "./share-management.css";

function dateLabel(value: string | null) {
  if (!value) return "Not started";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ShareManagement({ vaultId, refreshKey }: { vaultId: string; refreshKey: number }) {
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setShares(await api.listVaultShares(vaultId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shares.");
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  async function revoke(share: VaultShare) {
    if (!window.confirm(`Revoke access for ${share.readerEmail}? They will no longer be able to open this share.`)) return;
    setBusyId(share.id); setError(""); setNotice("");
    try {
      await api.revokeShare(vaultId, share.id);
      setNotice(`Access revoked for ${share.readerEmail}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke share.");
    } finally { setBusyId(""); }
  }

  async function extend(share: VaultShare, includeTime: boolean) {
    setBusyId(share.id); setError(""); setNotice("");
    try {
      await api.extendShare(vaultId, share.id, {
        additionalAccesses: 1,
        ...(includeTime ? { extendPostOpenBySeconds: 86400 } : {}),
      });
      setNotice(includeTime ? "Added one open and extended the reader's post-open window by 24 hours." : "Added one additional open.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to extend share.");
    } finally { setBusyId(""); }
  }

  async function revokeAll() {
    if (!window.confirm("Revoke every active share for this vault? Readers will lose access immediately.")) return;
    setBusyId("all"); setError(""); setNotice("");
    try {
      const result = await api.revokeAllShares(vaultId);
      setNotice(`Revoked ${result.revokedCount} active share(s).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke shares.");
    } finally { setBusyId(""); }
  }

  const activeCount = shares.filter((share) => share.status === "active").length;

  return (
    <section className="detail-section share-management">
      <div className="section-heading-inline share-management-heading">
        <h3><Users size={16} /> Share management <span className="queue-count">{activeCount} active</span></h3>
        <div className="share-management-actions">
          <button className="icon-button" title="Refresh shares" onClick={() => void refresh()} disabled={loading || !!busyId}><RefreshCw size={15} /></button>
          {activeCount > 0 && <button className="secondary-button danger-outline" onClick={() => void revokeAll()} disabled={!!busyId}>Revoke all</button>}
        </div>
      </div>
      {error && <div className="form-error share-feedback">{error}</div>}
      {notice && <div className="form-notice share-feedback">{notice}</div>}
      {loading ? <p className="muted-note">Loading shares…</p> : shares.length === 0 ? <p className="muted-note">No shares have been created for this vault yet.</p> : (
        <div className="share-list">
          {shares.map((share) => {
            const canExtend = share.status === "active" || (share.status === "expired" && share.successfulOpenCount >= share.maxAccessCount);
            const canExtendTime = !!share.firstOpenedAt && !!share.postOpenExpiresAt && share.status === "active";
            return (
              <article className="share-row" key={share.id}>
                <div className="share-row-main">
                  <div className="share-reader"><strong>{share.readerEmail}</strong><span className={`share-status ${share.status}`}>{share.status}</span></div>
                  <div className="share-meta">
                    <span>{share.permissions.join(" + ")}</span>
                    <span>{share.successfulOpenCount} / {share.maxAccessCount} opens</span>
                    <span><Clock3 size={12} /> Shared {dateLabel(share.sharedAt)}</span>
                    <span>Reader expiry: {dateLabel(share.postOpenExpiresAt)}</span>
                  </div>
                </div>
                <div className="share-row-actions">
                  {canExtend && <button className="secondary-button" disabled={!!busyId} onClick={() => void extend(share, false)}>+1 open</button>}
                  {canExtendTime && <button className="secondary-button" disabled={!!busyId} onClick={() => void extend(share, true)}>+24h & 1 open</button>}
                  {share.status === "active" && <button className="icon-button danger-icon" title="Revoke share" disabled={!!busyId} onClick={() => void revoke(share)}><ShieldOff size={15} /></button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
