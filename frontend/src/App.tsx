import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Archive, Check, ChevronDown,
  CircleHelp, Clock3, Command, FilePlus2, Folder, FolderPlus, KeyRound, LayoutDashboard,
  LoaderCircle, LockKeyhole, LogOut, MoreHorizontal, Plus, Search, ShieldCheck,
  ShieldEllipsis, Sparkles, Trash2, X,
} from "lucide-react";
import { api, type AuditEvent, type Folder as VaultFolder, type Vault } from "./api";
import { confirmSignUp, getSession, signIn, signOut, signUp } from "./auth";

type View = "vaults" | "folders" | "activity";
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
      setEvents(Array.isArray(auditData) ? auditData : []);
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
          <button className={view === "activity" ? "nav-item active" : "nav-item"} onClick={() => setView("activity")}><Activity size={17} /> Activity</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="security-icon"><ShieldCheck size={17} /></span><div><strong>Private by design</strong><p>Your vaults are encrypted at rest.</p></div></div>
          <div className="profile-row"><div className="avatar">{(userEmail[0] || "V").toUpperCase()}</div><div className="profile-copy"><strong>{userEmail || "Your account"}</strong><span>Personal workspace</span></div><button className="icon-button" title="Sign out" onClick={handleLogout}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{view === "vaults" ? "My vaults" : view === "folders" ? "Folders" : "Activity"}</strong></div>
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
            {loading ? <div className="loading-state"><LoaderCircle className="spin" size={22} /> Loading your vaults…</div> : filteredVaults.length === 0 ? <div className="empty-state"><div className="empty-art"><LockKeyhole size={25} /></div><h3>{query ? "No vaults found" : "Your first vault starts here"}</h3><p>{query ? "Try a different search term." : "Create a private space for a note, credential, or file you need to share securely."}</p>{!query && <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Create your first vault</button>}</div> : <div className="vault-grid">{filteredVaults.map((vault) => <article className="vault-card" key={vault.id}><div className="vault-card-top"><div className="vault-file-icon"><KeyRound size={19} /></div><div className={`status-pill ${vault.status.toLowerCase()}`}><span />{vault.status.replaceAll("_", " ")}</div><div className="card-menu"><button className="icon-button" title="Vault actions" onClick={() => handleVaultAction(vault, "revoke")} disabled={busyId === vault.id}><MoreHorizontal size={18} /></button></div></div><h3>{vault.name}</h3><p className="vault-description">{vault.description || "Private encrypted content"}</p><div className="vault-meta"><span><Clock3 size={14} /> {ttlLabel(vault.overallTtlSeconds)}</span><span><Folder size={14} /> {folders.find((folder) => folder.id === vault.folderId)?.name || "Unfiled"}</span></div><div className="vault-card-footer"><span>Created {formatDate(vault.createdAt)}</span><button className="text-action" disabled={busyId === vault.id} onClick={() => handleVaultAction(vault, "delete")}>Destroy <ArrowRight size={14} /></button></div></article>)}</div>}
          </>}

          {view === "folders" && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ORGANIZE YOUR SPACE</div><h1>Folders, <em>in order.</em></h1><p className="page-subtitle">Group your vaults without changing their access or expiry settings.</p></div><button className="primary-button" onClick={() => setShowFolder(true)}><Plus size={17} /> New folder</button></section><div className="folder-grid">{folders.map((folder) => <div className="folder-card" key={folder.id}><div className="folder-illustration"><Folder size={23} /></div><div><h3>{folder.name}</h3><p>{vaults.filter((vault) => vault.folderId === folder.id).length} vaults</p></div></div>)}</div>{folders.length === 0 && <div className="empty-state"><div className="empty-art"><Folder size={25} /></div><h3>No folders yet</h3><p>Create folders to keep your vaults organized.</p><button className="primary-button" onClick={() => setShowFolder(true)}><Plus size={17} /> Create a folder</button></div>}</>}

          {view === "activity" && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ACCOUNT HISTORY</div><h1>A clear <em>paper trail.</em></h1><p className="page-subtitle">A personal view of recent activity in your VaultShare account.</p></div></section><div className="activity-panel">{events.length === 0 ? <div className="empty-state compact"><div className="empty-art"><Activity size={24} /></div><h3>No activity yet</h3><p>Your recent account events will appear here.</p></div> : events.map((event) => <div className="activity-row" key={event.id}><div className="activity-dot"><Activity size={15} /></div><div className="activity-main"><strong>{event.action.replaceAll("_", " ").toLowerCase()}</strong><span>{event.method} · {event.route}</span></div><span className={event.statusCode >= 400 ? "http-code failed" : "http-code"}>{event.statusCode}</span><time>{formatDate(event.createdAt)}</time></div>)}</div></>}
        </div>
        <footer className="footer"><span>VAULTSHARE <span className="footer-dot">·</span> PRIVATE BY DEFAULT</span><span>Encrypted storage. Controlled access. Your rules.</span></footer>
      </main>

      {showCreate && <CreateVaultModal folders={folders} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); setToast("Your new vault is ready."); await loadData(); }} />}
      {showFolder && <CreateFolderModal onClose={() => setShowFolder(false)} onCreated={async () => { setShowFolder(false); setToast("Folder created."); await loadData(); }} />}
    </div>
  );
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
