import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, Archive, Check, CircleHelp, Clock3, Folder, FolderPlus,
  KeyRound, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, MoreHorizontal,
  Plus, Search, ShieldCheck, ShieldEllipsis, X, Eye, FileText, Upload, Download, Trash2, Share2, Save, Copy, BookOpen,
} from "lucide-react";
import { api, type AuditEvent, type Folder as VaultFolder, type Vault } from "./api";
import { confirmSignUp, getSession, signIn, signOut, signUp } from "./auth";

type View = "vaults" | "folders" | "activity" | "reader";
type AuthMode = "signin" | "signup" | "confirm";

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value?: string | null) {
  if (!value) return "Not started";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function ttlLabel(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  return `${Math.round(seconds / 86400)} days`;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [booting, setBooting] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [view, setView] = useState<View>("vaults");
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vaultData, folderData, auditData, me] = await Promise.all([
        api.listVaults(), api.listFolders(), api.listAudit(), api.me(),
      ]);
      setVaults(Array.isArray(vaultData) ? vaultData : []);
      setFolders(folderData?.folders ?? []);
      setEvents(Array.isArray(auditData?.events) ? auditData.events : []);
      setUserEmail(me.email);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getSession().then((session) => {
      if (session) { setAuthenticated(true); }
      setBooting(false);
    }).catch(() => setBooting(false));
  }, []);

  useEffect(() => { if (authenticated) void loadData(); }, [authenticated, loadData]);

  const filteredVaults = useMemo(() => vaults.filter((vault) =>
    `${vault.name} ${vault.description ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  ), [vaults, query]);

  async function handleLogout() {
    try { await api.logout(); } catch { /* local sign-out still clears this browser session */ }
    await signOut();
    setAuthenticated(false);
    setVaults([]);
  }

  async function handleVaultAction(vault: Vault, action: "delete" | "revoke") {
    const message = action === "delete"
      ? "Permanently destroy this vault and its derived copies? This cannot be undone."
      : "Revoke access to this vault and destroy its derived copies?";
    if (!window.confirm(message)) return;
    setBusyId(vault.id);
    setError("");
    try {
      if (action === "delete") await api.deleteVault(vault.id);
      else await api.revokeVault(vault.id);
      setToast(action === "delete" ? "Vault destroyed." : "Vault access revoked.");
      await loadData();
    } catch (err) { setError(readableError(err)); }
    finally { setBusyId(""); }
  }

  if (booting) return <div className="boot-screen"><div className="brand-mark"><LockKeyhole size={20} /></div><LoaderCircle className="spin" size={20} /></div>;
  if (!authenticated) return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;

  const activeCount = vaults.filter((vault) => vault.status === "ACTIVE").length;
  const expiringCount = vaults.filter((vault) => vault.expiresAt && new Date(vault.expiresAt).getTime() - Date.now() < 86400000 && new Date(vault.expiresAt).getTime() > Date.now()).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setView("vaults"); }}>
          <span className="brand-mark"><LockKeyhole size={19} strokeWidth={2.3} /></span>
          <span>vault<span className="brand-light">share</span><sup>V1</sup></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          <button className={view === "vaults" ? "nav-item active" : "nav-item"} onClick={() => setView("vaults")}><LayoutDashboard size={17} /> My vaults <span className="nav-count">{vaults.length}</span></button>
          <button className={view === "folders" ? "nav-item active" : "nav-item"} onClick={() => setView("folders")}><Folder size={17} /> Folders <span className="nav-count">{folders.length}</span></button>
          <button className={view === "activity" ? "nav-item active" : "nav-item"} onClick={() => setView("activity")}><Activity size={17} /> Activity</button>\n          <button className={view === "reader" ? "nav-item active" : "nav-item"} onClick={() => setView("reader")}><BookOpen size={17} /> Shared with me</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="security-icon"><ShieldCheck size={17} /></span><div><strong>Private by design</strong><p>Your vaults are encrypted at rest.</p></div></div>
          <div className="profile-row"><div className="avatar">{(userEmail[0] || "V").toUpperCase()}</div><div className="profile-copy"><strong>{userEmail || "Your account"}</strong><span>Personal workspace</span></div><button className="icon-button" title="Sign out" onClick={handleLogout}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{view === "vaults" ? "My vaults" : view === "folders" ? "Folders" : view === "reader" ? "Shared with me" : "Activity"}</strong></div>
          <div className="topbar-right"><span className="secure-indicator"><span /> End-to-end protected</span><button className="help-button" title="Help"><CircleHelp size={17} /></button></div>
        </header>

        <div className="content-wrap">
          {error && <div className="alert error-alert"><ShieldEllipsis size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
          {toast && <div className="alert success-alert"><Check size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={15} /></button></div>}

          {view === "vaults" && <>
            <section className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR PRIVATE SPACE</div><h1>Everything, <em>under lock.</em></h1><p className="page-subtitle">Keep sensitive files and notes in encrypted vaults. Share them with control, then let access expire.</p></div>
              <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Create a vault</button>
            </section>
            <section className="stats-grid">
              <div className="stat-card"><div className="stat-icon"><Archive size={17} /></div><span className="stat-label">Total vaults</span><strong>{vaults.length.toString().padStart(2, "0")}</strong><span className="stat-foot">Across your workspace</span></div>
              <div className="stat-card"><div className="stat-icon green"><ShieldCheck size={17} /></div><span className="stat-label">Active vaults</span><strong>{activeCount.toString().padStart(2, "0")}</strong><span className="stat-foot">Ready when you need them</span></div>
              <div className="stat-card"><div className="stat-icon amber"><Clock3 size={17} /></div><span className="stat-label">Expiring soon</span><strong>{expiringCount.toString().padStart(2, "0")}</strong><span className="stat-foot">Within the next 24 hours</span></div>
            </section>
            <section className="section-heading"><div><h2>Your vaults</h2><p>Only you can see what lives here.</p></div><div className="toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vaults..." /></label><button className="secondary-button" onClick={() => setShowFolder(true)}><FolderPlus size={16} /> New folder</button></div></section>
            {loading ? <div className="loading-state"><LoaderCircle className="spin" size={22} /> Loading your vaults…</div> : filteredVaults.length === 0 ? <div className="empty-state"><div className="empty-art"><LockKeyhole size={25} /></div><h3>{query ? "No vaults found" : "Your first vault starts here"}</h3><p>{query ? "Try a different search term." : "Create a private space for a note, credential, or file you need to share securely."}</p>{!query && <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Create your first vault</button>}</div> : <div className="vault-grid">{filteredVaults.map((vault) => <article className="vault-card" key={vault.id}><div className="vault-card-top"><div className="vault-file-icon"><KeyRound size={19} /></div><div className={`status-pill ${vault.status.toLowerCase()}`}><span />{vault.status.replaceAll("_", " ")}</div><div className="card-menu"><button className="icon-button" title="Vault actions" onClick={() => handleVaultAction(vault, "revoke")} disabled={busyId === vault.id}><MoreHorizontal size={18} /></button></div></div><h3>{vault.name}</h3><p className="vault-description">{vault.description || "Private encrypted content"}</p><div className="vault-meta"><span><Clock3 size={14} /> {ttlLabel(vault.overallTtlSeconds)}</span><span><Folder size={14} /> {folders.find((folder) => folder.id === vault.folderId)?.name || "Unfiled"}</span></div><div className="vault-card-footer"><span>Created {formatDate(vault.createdAt)}</span><div className="vault-card-actions"><button className="text-action" onClick={() => setSelectedVault(vault)}><Eye size={14} /> Open</button><button className="text-action" disabled={busyId === vault.id} onClick={() => handleVaultAction(vault, "delete")}>Destroy <ArrowRight size={14} /></button></div></div></article>)}</div>}
          </>}

          {view === "reader" && <ReaderWorkspace />}\n\n          {view === "folders" && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ORGANIZE YOUR SPACE</div><h1>Folders, <em>in order.</em></h1><p className="page-subtitle">Group your vaults without changing their access or expiry settings.</p></div><button className="primary-button" onClick={() => setShowFolder(true)}><Plus size={17} /> New folder</button></section><div className="folder-grid">{folders.map((folder) => <div className="folder-card" key={folder.id}><div className="folder-illustration"><Folder size={23} /></div><div><h3>{folder.name}</h3><p>{vaults.filter((vault) => vault.folderId === folder.id).length} vaults</p></div></div>)}</div>{folders.length === 0 && <div className="empty-state"><div className="empty-art"><Folder size={25} /></div><h3>No folders yet</h3><p>Create folders to keep your vaults organized.</p><button className="primary-button" onClick={() => setShowFolder(true)}><Plus size={17} /> Create a folder</button></div>}</>}

          {view === "activity" && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ACCOUNT HISTORY</div><h1>A clear <em>paper trail.</em></h1><p className="page-subtitle">A personal view of recent activity in your VaultShare account.</p></div></section><div className="activity-panel">{events.length === 0 ? <div className="empty-state compact"><div className="empty-art"><Activity size={24} /></div><h3>No activity yet</h3><p>Your recent account events will appear here.</p></div> : events.map((event) => <div className="activity-row" key={event.id}><div className="activity-dot"><Activity size={15} /></div><div className="activity-main"><strong>{event.action.replaceAll("_", " ").toLowerCase()}</strong><span>{event.method} · {event.route}</span></div><span className={event.statusCode >= 400 ? "http-code failed" : "http-code"}>{event.statusCode}</span><time>{formatDate(event.createdAt)}</time></div>)}</div></>}
        </div>
        <footer className="footer"><span>VAULTSHARE <span className="footer-dot">·</span> PRIVATE BY DEFAULT</span><span>Encrypted storage. Controlled access. Your rules.</span></footer>
      </main>

      {showCreate && <CreateVaultModal folders={folders} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); setToast("Your new vault is ready."); await loadData(); }} />}
      {showFolder && <CreateFolderModal onClose={() => setShowFolder(false)} onCreated={async () => { setShowFolder(false); setToast("Folder created."); await loadData(); }} />}
      {selectedVault && <VaultDetailModal vault={selectedVault} folders={folders} onClose={() => setSelectedVault(null)} onChanged={async () => { await loadData(); }} />}
    </div>
  );
}



function ReaderWorkspace() {
  const [shareCode, setShareCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [opened, setOpened] = useState<import("./api").OpenedShare | null>(null);
  const [files, setFiles] = useState<import("./api").SharedVaultFile[]>([]);
  const [proposedContent, setProposedContent] = useState("");
  const [accessVaultId, setAccessVaultId] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function open(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setFiles([]); setOpened(null);
    try { const result = await api.openShare(shareCode.trim(), passphrase); setOpened(result); setNotice("Share opened. Your access limits and expiry are enforced by the server."); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }
  async function loadFiles() {
    setBusy(true); setError("");
    try { const result = await api.listSharedFiles(shareCode.trim(), passphrase); setFiles(result.files ?? []); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }
  async function download(file: import("./api").SharedVaultFile) {
    setBusy(true); setError("");
    try { const blob = await api.downloadSharedFile(shareCode.trim(), file.id, passphrase); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.originalName || "download"; anchor.click(); URL.revokeObjectURL(url); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }
  async function submitWrite(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const result = await api.createWriteRequest(shareCode.trim(), { proposedContent, passphrase }); setNotice(`Write proposal submitted (${result.status}). The vault owner must approve it before any change takes effect.`); setProposedContent(""); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }
  async function requestAccess(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const result = await api.requestVaultAccess(accessVaultId.trim(), accessMessage.trim() || undefined); setNotice(`Access request submitted (${result.request.status}). The vault owner will be notified.`); setAccessVaultId(""); setAccessMessage(""); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }

  return <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> SECURE READER SPACE</div><h1>Shared with <em>you.</em></h1><p className="page-subtitle">Open a vault using the share code and passphrase provided by its owner.</p></div></section>
    {error && <div className="form-error reader-alert">{error}</div>}{notice && <div className="form-notice reader-alert">{notice}</div>}
    <div className="reader-grid">
      <section className="reader-panel"><div className="reader-panel-title"><KeyRound size={17}/><h2>Open a shared vault</h2></div>
        <form className="modal-form reader-form" onSubmit={open}>
          <label>Share code<input required value={shareCode} onChange={e => setShareCode(e.target.value)} placeholder="Paste the 32-character share code" autoComplete="off" /></label>
          <label>Share passphrase<input required type="password" maxLength={128} value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Enter the passphrase" autoComplete="off" /></label>
          <button className="primary-button" disabled={busy || !shareCode.trim() || !passphrase}>{busy ? "Opening…" : "Verify & open share"} <ArrowRight size={15}/></button>
        </form>
      </section>
      <section className="reader-panel request-panel"><div className="reader-panel-title"><ShieldCheck size={17}/><h2>Request access</h2></div><p className="muted-note">If you have a vault ID but no active share, you can ask its owner for READ access.</p>
        <form className="modal-form reader-form" onSubmit={requestAccess}>
          <label>Vault ID<input required value={accessVaultId} onChange={e => setAccessVaultId(e.target.value)} placeholder="Vault UUID" /></label>
          <label>Message <span className="optional">OPTIONAL</span><textarea rows={2} maxLength={500} value={accessMessage} onChange={e => setAccessMessage(e.target.value)} placeholder="Tell the owner why you need access" /></label>
          <button className="secondary-button" disabled={busy || !accessVaultId.trim()}>Send access request</button>
        </form>
      </section>
    </div>
    {opened && <section className="reader-opened">
      <div className="reader-opened-head"><div><div className="eyebrow"><span className="eyebrow-dot"/> VERIFIED SHARE</div><h2>Shared vault content</h2></div><span className="status-pill active"><span/> OPENED</span></div>
      <div className="reader-stats"><div><span>Permissions</span><strong>{opened.permissions.join(" + ")}</strong></div><div><span>Successful opens</span><strong>{opened.successfulOpenCount}</strong></div><div><span>Remaining opens</span><strong>{opened.remainingAccesses}</strong></div><div><span>Reader expiry</span><strong>{formatDate(opened.postOpenExpiresAt)}</strong></div></div>
      {opened.permissions.includes("READ") ? <><h3>Protected content</h3><pre className="vault-content-preview">{opened.content ?? "No readable content was returned."}</pre>
        <div className="section-heading-inline reader-files-heading"><h3>Shared files</h3><button className="secondary-button" onClick={() => void loadFiles()} disabled={busy}><FileText size={15}/> Load shared files</button></div>
        {files.map(file => <div className="file-row" key={file.id}><span><FileText size={16}/>{file.originalName}</span><button className="icon-button" title="Download shared file" disabled={busy} onClick={() => void download(file)}><Download size={15}/></button></div>)}
      </> : <p className="muted-note">This is a WRITE-only share. Original vault content is not disclosed to you.</p>}
      {opened.permissions.includes("WRITE") && <form className="modal-form write-proposal" onSubmit={submitWrite}><h3>Propose a change</h3><p className="muted-note">Your proposal is encrypted and sent to the owner for approval. It does not modify the original vault unless approved.</p><label>Proposed content<textarea required rows={6} maxLength={900000} value={proposedContent} onChange={e => setProposedContent(e.target.value)} placeholder="Enter the complete proposed replacement content…" /></label><button className="primary-button" disabled={busy || !proposedContent.trim()}>Submit for owner approval</button></form>}
    </section>}
  </>;
}

function VaultDetailModal({ vault, folders, onClose, onChanged }: { vault: Vault; folders: VaultFolder[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<import("./api").VaultDetail | null>(null);
  const [files, setFiles] = useState<import("./api").VaultFile[]>([]);
  const [name, setName] = useState(vault.name);
  const [description, setDescription] = useState(vault.description ?? "");
  const [folderId, setFolderId] = useState(vault.folderId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [accessRequests, setAccessRequests] = useState<import("./api").OwnerAccessRequest[]>([]);
  const [writeRequests, setWriteRequests] = useState<import("./api").OwnerWriteRequest[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<import("./api").WriteRequestDetail | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewBusyId, setReviewBusyId] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [vaultDetail, fileData, accessData, writeData] = await Promise.all([api.getVault(vault.id), api.listFiles(vault.id), api.listOwnerAccessRequests(vault.id), api.listOwnerWriteRequests(vault.id)]);
      setDetail(vaultDetail);
      setFiles(fileData.files ?? []);\n      setAccessRequests(accessData.requests ?? []);\n      setWriteRequests(writeData.requests ?? []);
      setName(vaultDetail.name);
      setDescription(vaultDetail.description ?? "");
      setFolderId(vaultDetail.folderId ?? "");
    } catch (err) { setError(readableError(err)); }
  }, [vault.id]);

  useEffect(() => { void refresh(); }, [refresh]);


  async function reviewAccess(requestId: string, decision: "APPROVE" | "REJECT") {
    setReviewBusyId(requestId); setError(""); setNotice("");
    try {
      await api.reviewAccessRequest(vault.id, requestId, decision, reviewMessage.trim() || undefined);
      setReviewMessage(""); setNotice(`Access request ${decision.toLowerCase()}ed.`); await refresh();
    } catch (err) { setError(readableError(err)); } finally { setReviewBusyId(""); }
  }

  async function openProposal(requestId: string) {
    setReviewBusyId(requestId); setError("");
    try { setSelectedProposal(await api.getOwnerWriteRequest(vault.id, requestId)); }
    catch (err) { setError(readableError(err)); } finally { setReviewBusyId(""); }
  }

  async function reviewProposal(decision: "APPROVE" | "REJECT") {
    if (!selectedProposal) return;
    setReviewBusyId(selectedProposal.id); setError(""); setNotice("");
    try {
      const result = await api.reviewWriteRequest(vault.id, selectedProposal.id, decision);
      setSelectedProposal(null);
      setNotice(result.derivedVault ? `Proposal approved. A derived copy was created: ${result.derivedVault.name}.` : "Write proposal rejected.");
      await refresh(); await onChanged();
    } catch (err) { setError(readableError(err)); } finally { setReviewBusyId(""); }
  }

  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api.updateVault(vault.id, { name, description: description || null, folderId: folderId || null });
      setNotice("Vault details updated."); await refresh(); await onChanged();
    } catch (err) { setError(readableError(err)); } finally { setBusy(false); }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try { await api.uploadFile(vault.id, file); setNotice("File encrypted and uploaded."); await refresh(); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function download(file: import("./api").VaultFile) {
    setBusy(true); setError("");
    try {
      const blob = await api.downloadFile(vault.id, file.id);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = file.originalName || "download"; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(readableError(err)); } finally { setBusy(false); }
  }

  async function removeFile(fileId: string) {
    if (!window.confirm("Permanently delete this encrypted file?")) return;
    setBusy(true); setError("");
    try { await api.deleteFile(vault.id, fileId); await refresh(); setNotice("File deleted."); }
    catch (err) { setError(readableError(err)); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-card vault-detail-modal">
      <div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> VAULT WORKSPACE</div><h2>{vault.name}</h2><p>Owner controls, encrypted content and attached files.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      {error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}
      {!detail ? <div className="loading-state">Loading vault…</div> : <>
        <form className="modal-form" onSubmit={saveMetadata}>
          <div className="form-row"><label>Vault name<input value={name} maxLength={150} required onChange={e => setName(e.target.value)} /></label><label>Folder<select value={folderId} onChange={e => setFolderId(e.target.value)}><option value="">Unfiled</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
          <label>Description<input value={description} maxLength={500} onChange={e => setDescription(e.target.value)} /></label>
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowShare(true)}><Share2 size={15} /> Share vault</button><button className="primary-button" disabled={busy || !name.trim()}><Save size={15} /> Save details</button></div>
        </form>
        <section className="detail-section"><h3><FileText size={16} /> Protected content</h3><pre className="vault-content-preview">{detail.content}</pre><p className="muted-note">Content is shown only after the authenticated owner requests this vault from the API. Content editing is not exposed because the current backend has no owner content-update endpoint.</p></section>
        <section className="detail-section"><div className="section-heading-inline"><h3>Encrypted files</h3><label className="secondary-button upload-control"><Upload size={15} /> Upload file<input type="file" onChange={upload} disabled={busy} /></label></div>
          {files.length === 0 ? <p className="muted-note">No files attached to this vault.</p> : files.map(file => <div className="file-row" key={file.id}><span><FileText size={16} /> {file.originalName}</span><div><button className="icon-button" title="Download" disabled={busy} onClick={() => void download(file)}><Download size={15} /></button><button className="icon-button danger-icon" title="Delete file" disabled={busy} onClick={() => void removeFile(file.id)}><Trash2 size={15} /></button></div></div>)}
        </section>

        <section className="detail-section approval-section">
          <div className="section-heading-inline"><h3>Access requests <span className="queue-count">{accessRequests.filter(r => r.status === "PENDING").length}</span></h3><span className="muted-note">READ access requests</span></div>
          {accessRequests.length === 0 ? <p className="muted-note">No access requests for this vault.</p> : accessRequests.map(request => <div className="approval-row" key={request.id}>
            <div className="approval-main"><strong>{request.requesterEmail}</strong><span>{request.message || "No message provided"}</span><small>{formatDate(request.requestedAt)} · {request.status}</small></div>
            {request.status === "PENDING" && <div className="approval-actions"><button className="secondary-button" disabled={!!reviewBusyId} onClick={() => void reviewAccess(request.id, "REJECT")}>Reject</button><button className="primary-button" disabled={!!reviewBusyId} onClick={() => void reviewAccess(request.id, "APPROVE")}>Approve</button></div>}
          </div>)}
          {accessRequests.some(r => r.status === "PENDING") && <label className="review-message-label">Optional response to requester<input value={reviewMessage} maxLength={500} onChange={e => setReviewMessage(e.target.value)} placeholder="Add a short response" /></label>}
        </section>
        <section className="detail-section approval-section">
          <div className="section-heading-inline"><h3>WRITE proposals <span className="queue-count">{writeRequests.filter(r => r.status === "PENDING").length}</span></h3><span className="muted-note">Owner approval required</span></div>
          {writeRequests.length === 0 ? <p className="muted-note">No WRITE proposals for this vault.</p> : writeRequests.map(request => <div className="approval-row" key={request.id}>
            <div className="approval-main"><strong>Reader {request.requestedBy.slice(0, 8)}…</strong><span>Submitted {formatDate(request.requestedAt)}</span><small>{request.status}</small></div>
            <div className="approval-actions">{request.status === "PENDING" ? <button className="secondary-button" disabled={!!reviewBusyId} onClick={() => void openProposal(request.id)}>Review proposal</button> : <span className="muted-note">Reviewed</span>}</div>
          </div>)}
          {selectedProposal && <div className="proposal-review"><div className="section-heading-inline"><h3>Proposed replacement content</h3><button className="icon-button" onClick={() => setSelectedProposal(null)}><X size={16}/></button></div><pre className="vault-content-preview">{selectedProposal.proposedContent}</pre><p className="muted-note">Approving creates an independent derived copy for the reader. The original vault remains unchanged.</p><div className="approval-actions"><button className="secondary-button" disabled={!!reviewBusyId} onClick={() => void reviewProposal("REJECT")}>Reject proposal</button><button className="primary-button" disabled={!!reviewBusyId} onClick={() => void reviewProposal("APPROVE")}>Approve & create derived copy</button></div></div>}
        </section>
        <div className="detail-footer"><span>Status: <strong>{detail.status}</strong> · Expiry policy: <strong>{detail.expiryPolicy}</strong></span><span>Overall TTL: {ttlLabel(detail.overallTtlSeconds)}</span></div>
      </>}
    </div>
    {showShare && <ShareVaultModal vault={vault} onClose={() => setShowShare(false)} onCreated={() => { setShowShare(false); setNotice("Share created. Copy the share code and passphrase now; the passphrase is not retrievable later."); }} />}
  </div>;
}

function ShareVaultModal({ vault, onClose, onCreated }: { vault: Vault; onClose: () => void; onCreated: () => void }) {
  const [readerId, setReaderId] = useState("");
  const [permissions, setPermissions] = useState<("READ" | "WRITE")[]>(["READ"]);
  const [maxAccessCount, setMaxAccessCount] = useState("5");
  const [postOpenTtlSeconds, setPostOpenTtlSeconds] = useState("86400");
  const [passphrase, setPassphrase] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() { setBusy(true); setError(""); try { const result = await api.generateSharePassphrase(vault.id); setPassphrase(result.passphrase); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.createShare(vault.id, { readerId: readerId.trim(), permissions, maxAccessCount: Number(maxAccessCount), postOpenTtlSeconds: postOpenTtlSeconds ? Number(postOpenTtlSeconds) : null, passphrase });
      setShareCode(result.shareCode);
    } catch (err) { setError(readableError(err)); } finally { setBusy(false); }
  }
  function togglePermission(permission: "READ" | "WRITE") { setPermissions(current => current.includes(permission) ? current.filter(p => p !== permission) : [...current, permission]); }
  return <div className="modal-backdrop nested-modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-card small-modal"><div className="modal-header"><div><div className="eyebrow">CONTROLLED ACCESS</div><h2>Share {vault.name}</h2><p>Only share with a verified VaultShare account.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
    {shareCode ? <div className="share-created"><p>Share created successfully.</p><label>Share code</label><div className="copy-value">{shareCode}<button className="icon-button" onClick={() => void navigator.clipboard.writeText(shareCode)}><Copy size={15} /></button></div><label>Passphrase</label><div className="copy-value">{passphrase}<button className="icon-button" onClick={() => void navigator.clipboard.writeText(passphrase)}><Copy size={15} /></button></div><p className="muted-note">Send both values to the reader through a separate secure channel. The passphrase cannot be retrieved later.</p><button className="primary-button" onClick={() => { onCreated(); onClose(); }}>Done</button></div> : <form className="modal-form" onSubmit={submit}>
      <label>Reader account ID (UUID)<input required value={readerId} onChange={e => setReaderId(e.target.value)} placeholder="Verified reader's account ID" /></label>
      <div className="permission-options"><label><input type="checkbox" checked={permissions.includes("READ")} onChange={() => togglePermission("READ")} /> READ</label><label><input type="checkbox" checked={permissions.includes("WRITE")} onChange={() => togglePermission("WRITE")} /> WRITE</label></div>
      <div className="form-row"><label>Maximum opens<input type="number" min="1" max="1000" required value={maxAccessCount} onChange={e => setMaxAccessCount(e.target.value)} /></label><label>Post-open TTL<select value={postOpenTtlSeconds} onChange={e => setPostOpenTtlSeconds(e.target.value)}><option value="3600">1 hour</option><option value="21600">6 hours</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="">No per-reader TTL</option></select></label></div>
      <label>Share passphrase<input required minLength={12} maxLength={128} value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Generate or enter a strong passphrase" /></label><button type="button" className="secondary-button" onClick={() => void generate()} disabled={busy}>Generate secure passphrase</button>
      {error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !readerId.trim() || !passphrase || permissions.length === 0}>{busy ? "Creating…" : "Create share"}</button></div>
    </form>}
  </div></div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") { await signUp(email, password); setMode("confirm"); setNotice("A verification code has been sent to your email."); }
      else if (mode === "confirm") { await confirmSignUp(email, code); await signIn(email, password); onAuthenticated(); }
      else { await signIn(email, password); onAuthenticated(); }
    } catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }

  return <div className="auth-shell"><div className="auth-left"><a className="brand auth-brand" href="#"><span className="brand-mark"><LockKeyhole size={19} /></span><span>vault<span className="brand-light">share</span><sup>V1</sup></span></a><div className="auth-message"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR DATA. YOUR RULES.</div><h1>Share with<br /><em>confidence.</em></h1><p>Private by design. Temporary by default. VaultShare gives you control over what you share, who sees it, and for how long.</p><div className="auth-feature"><span><ShieldCheck size={17} /></span><div><strong>Encrypted at rest</strong><small>A unique encryption key for every vault.</small></div></div><div className="auth-feature"><span><Clock3 size={17} /></span><div><strong>Access that expires</strong><small>Set limits and let time do the rest.</small></div></div></div><div className="auth-left-foot">BUILT FOR THE THINGS THAT SHOULD STAY PRIVATE.</div></div><div className="auth-right"><div className="auth-form-wrap"><div className="auth-kicker">SECURE WORKSPACE ACCESS</div><h2>{mode === "signup" ? "Create your account" : mode === "confirm" ? "Verify your email" : "Welcome back"}</h2><p className="auth-sub">{mode === "confirm" ? `Enter the code sent to ${email}.` : mode === "signup" ? "Start sharing sensitive information on your terms." : "Sign in to access your private vaults."}</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === "confirm"} placeholder="you@example.com" /></label>{mode !== "confirm" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}{mode === "confirm" && <label>Verification code<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter the code from your email" /></label>}{error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>{mode === "signup" ? "Create account" : mode === "confirm" ? "Verify & continue" : "Sign in"} <ArrowRight size={16} /></>}</button></form><div className="auth-switch">{mode === "signin" ? <>New to VaultShare? <button onClick={() => { setMode("signup"); setError(""); }}>Create an account</button></> : mode === "signup" ? <>Already have an account? <button onClick={() => { setMode("signin"); setError(""); }}>Sign in</button></> : <button onClick={() => { setMode("signup"); setError(""); }}>Back to sign up</button>}</div><div className="auth-assurance"><LockKeyhole size={14} /> Your credentials are handled by Amazon Cognito.</div></div><div className="auth-copyright">© {new Date().getFullYear()} VaultShare <span>·</span> Secure sharing, simplified.</div></div></div>;
}

function CreateVaultModal({ folders, onClose, onCreated }: { folders: VaultFolder[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [content, setContent] = useState("");
  const [ttl, setTtl] = useState("86400"); const [policy, setPolicy] = useState<"DESTROY" | "REVOKE_ACCESS">("DESTROY");
  const [folderId, setFolderId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.createVault({ name, description, content, overallTtlSeconds: Number(ttl), expiryPolicy: policy, folderId: folderId || null }); await onCreated(); }
    catch (err) { setError(readableError(err)); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-card"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> NEW SECURE SPACE</div><h2>Create a vault</h2><p>Everything is encrypted before it is stored.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit} className="modal-form"><label>Vault name<input required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Project credentials" /></label><label>Description <span className="optional">OPTIONAL</span><input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note about this vault" /></label><label>Private content<textarea required maxLength={900000} rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add the note or secret you want to keep protected…" /></label><div className="form-row"><label>Overall expiry<select value={ttl} onChange={(e) => setTtl(e.target.value)}><option value="3600">1 hour</option><option value="21600">6 hours</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option></select></label><label>On expiry<select value={policy} onChange={(e) => setPolicy(e.target.value as "DESTROY" | "REVOKE_ACCESS")}><option value="DESTROY">Destroy content</option><option value="REVOKE_ACCESS">Revoke access</option></select></label></div>{folders.length > 0 && <label>Folder<select value={folderId} onChange={(e) => setFolderId(e.target.value)}><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim() || !content.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <><LockKeyhole size={16} /> Create encrypted vault</>}</button></div></form></div></div>;
}

function CreateFolderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await api.createFolder(name); await onCreated(); } catch (err) { setError(readableError(err)); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-card small-modal"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> ORGANIZE</div><h2>New folder</h2><p>Give your vaults a little structure.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form className="modal-form" onSubmit={submit}><label>Folder name<input autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work, Personal…" /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <><Plus size={16} /> Create folder</>}</button></div></form></div></div>;
}
