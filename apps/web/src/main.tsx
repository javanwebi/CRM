import {
  Operations,
  CommandPalette,
  operationPages,
} from "./components/operations";
import {
  Inbox,
  CalendarDays,
  Workflow,
  Bell,
  ContactRound,
} from "lucide-react";
import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Building2,
  Users,
  Target,
  KanbanSquare,
  CheckSquare,
  Settings,
  PanelRightClose,
  Search,
  Plus,
  ArrowUpLeft,
  LogOut,
  ChevronLeft,
  Activity,
  X,
  Globe,
  Shield,
  Briefcase,
  FileText,
  Phone,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "../../../packages/ui/src/button";
import { api } from "./api";
import "./style.css";
import { Auth, Empty } from "./components/account";
type Row = { id: string; [key: string]: any };
const menus = [
  ["dashboard", "نمای کلی", "Overview", LayoutDashboard],
  ["inbox", "صندوق ورودی", "Inbox", Inbox],
  ["customer360", "پرونده مشتری", "Customer 360", ContactRound],
  ["calendar", "تقویم", "Calendar", CalendarDays],
  ["workflows", "جریان‌های کاری", "Workflows", Workflow],
  ["notifications", "اعلان‌ها", "Notifications", Bell],
  ["accounts", "مشتریان", "Customers", Building2],
  ["contacts", "مخاطبان", "Contacts", Users],
  ["leads", "سرنخ‌ها", "Leads", Target],
  ["pipeline", "قیف فروش", "Sales pipeline", KanbanSquare],
  ["tasks", "وظایف", "Tasks", CheckSquare],
  ["activities", "فعالیت‌ها", "Activities", Phone],
  ["call_logs", "ثبت تماس", "Call logs", Phone],
  ["notes", "یادداشت‌ها", "Notes", FileText],
  ["team", "اعضای تیم", "Team", Shield],
  ["settings", "تنظیمات", "Settings", Settings],
] as const;
const faFields: Record<string, string> = {
  name: "نام",
  email: "ایمیل",
  password: "رمز عبور (حداقل ۱۲ کاراکتر)",
  phone: "تلفن",
  description: "توضیحات",
  kind: "نوع",
  account_id: "مشتری مرتبط",
  status: "وضعیت",
  source: "منبع",
  pipeline_id: "قیف",
  stage_id: "مرحله",
  value: "مبلغ",
  currency: "واحد پول",
  due_at: "موعد انجام",
  reminder_at: "زمان یادآوری",
  outcome: "نتیجه تماس",
  duration_seconds: "مدت تماس (ثانیه)",
  body: "متن یادداشت",
  role_id: "نقش",
  code: "کد دعوت",
};
const fields: Record<string, string[]> = {
  accounts: ["name", "kind", "email", "phone", "description"],
  contacts: ["name", "email", "phone", "account_id"],
  leads: ["name", "email", "status", "source"],
  deals: [
    "name",
    "account_id",
    "pipeline_id",
    "stage_id",
    "value",
    "currency",
    "status",
  ],
  tasks: [
    "name",
    "status",
    "due_at",
    "reminder_at",
    "account_id",
    "description",
  ],
  call_logs: [
    "name",
    "account_id",
    "outcome",
    "duration_seconds",
    "description",
  ],
  activities: ["name", "kind", "account_id", "description"],
  notes: ["name", "body", "account_id"],
};
const enums: Record<string, Record<string, string[]>> = {
  call_logs: { outcome: ["answered", "no_answer", "busy", "follow_up"] },
  accounts: { kind: ["company", "person"] },
  leads: { status: ["new", "qualified", "lost", "converted"] },
  deals: { status: ["open", "won", "lost"], currency: ["IRR", "USD", "EUR"] },
  tasks: { status: ["todo", "doing", "done"] },
  activities: { kind: ["call", "meeting", "email"] },
};
const enumFa: Record<string, string> = {
  answered: "پاسخ داده شد",
  no_answer: "بدون پاسخ",
  busy: "اشغال",
  follow_up: "نیازمند پیگیری",
  company: "حقوقی",
  person: "حقیقی",
  new: "جدید",
  qualified: "واجد شرایط",
  lost: "از دست رفته",
  converted: "تبدیل شده",
  open: "باز",
  won: "موفق",
  todo: "انجام نشده",
  doing: "در حال انجام",
  done: "انجام شده",
  call: "تماس",
  meeting: "جلسه",
  email: "ایمیل",
};
function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("crm_locale") ?? "fa",
  );
  const fa = lang === "fa";
  const tr = (a: string, b: string) => (fa ? a : b);
  const [user, setUser] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tenants, setTenants] = useState<Row[]>([]),
    [tenant, setTenant] = useState(
      () => localStorage.getItem("crm_tenant") ?? "",
    );
  const [page, setPage] = useState("dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0),
    [detail, setDetail] = useState<Row | null>(null);
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [edit, setEdit] = useState<Row | null>(null),
    [references, setReferences] = useState<Record<string, Row[]>>({}),
    [offset, setOffset] = useState(1),
    [sort, setSort] = useState("created_at"),
    [statusFilter, setStatusFilter] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    document.documentElement.dir = fa ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("crm_locale", lang);
  }, [lang, fa]);
  const loadTenants = useCallback(async () => {
    const rows = await api<Row[]>("/tenants");
    setTenants(rows);
    setTenant((old) =>
      rows.some((t) => t.id === old) ? old : (rows[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    api("/me")
      .then(async ({ user }) => {
        setUser(user);
        await loadTenants();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [loadTenants]);
  useEffect(() => {
    localStorage.setItem("crm_tenant", tenant);
    setOffset(1);
    setDetail(null);
    setData(null);
  }, [tenant, page]);
  useEffect(() => {
    if (!user || !tenant || operationPages.includes(page)) return;
    let live = true;
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const path = page === "pipeline" ? "deals" : page;
        const result = await api(
          `/t/${tenant}/${path}${fields[path] ? `?page=${offset}&limit=25&sort=${sort}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusFilter)}` : ""}`,
        );
        if (live) setData(result);
        if (
          page === "pipeline" ||
          page === "contacts" ||
          page === "accounts" ||
          modal
        ) {
          const tables = ["accounts", "pipelines", "pipeline_stages"];
          const values = await Promise.all(
            tables.map((table) => api(`/t/${tenant}/${table}?limit=100`)),
          );
          const ref = Object.fromEntries(
            tables.map((table, i) => [table, values[i].data]),
          );
          if (live) setReferences(ref);
        }
      } catch (e) {
        if (live) {
          setError((e as Error).message);
          setData(null);
        }
      } finally {
        if (live) setBusy(false);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [user, tenant, page, search, refresh, offset, sort, statusFilter, modal]);
  function open(type: string, row: Row | null = null) {
    setEdit(row);
    setModal(type);
    setError("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const b = Object.fromEntries(formData);
    setBusy(true);
    setError("");
    try {
      if (modal === "organization") {
        const t = await api<Row>("/tenants", "POST", { name: b.name });
        await loadTenants();
        setTenant(t.id);
      } else if (modal === "invite") {
        const r = await api(`/t/${tenant}/invitations`, "POST", b);
        setNotice(
          `${tr("کد دعوت (برای کاربر موردنظر ارسال کنید):", "Invitation code (share with intended user):")} ${r.invitation_token}`,
        );
      } else if (modal === "accept") {
        await api("/invitations/accept", "POST", b);
        await loadTenants();
      } else if (modal === "role") {
        await api(`/t/${tenant}/roles`, "POST", {
          name: b.name,
          grants: formData.getAll("grants"),
        });
      } else if (modal) {
        const body: Record<string, any> = { ...b };
        for (const k of Object.keys(body)) {
          if (k.endsWith("_id") && body[k] === "") body[k] = null;
          if (["value", "duration_seconds"].includes(k))
            body[k] = Number(body[k]);
          if (["due_at", "reminder_at"].includes(k))
            body[k] = body[k] ? new Date(body[k]).toISOString() : null;
        }
        await api(
          `/t/${tenant}/${modal}${edit?.id ? "/" + edit.id : ""}`,
          edit?.id ? "PATCH" : "POST",
          body,
        );
      }
      setModal(null);
      setRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const label = menus.find((m) => m[0] === page);
  const activeTenant = tenants.find((t) => t.id === tenant);
  if (loading)
    return (
      <div className="splash">
        {tr("در حال اتصال به فضای کاری…", "Connecting to workspace…")}
      </div>
    );
  if (!user)
    return (
      <Auth
        fa={fa}
        onUser={async (u) => {
          setUser(u);
          await loadTenants();
        }}
        setLang={() => setLang(fa ? "en" : "fa")}
      />
    );
  const visibleRows = data?.data ?? [];
  return (
    <div className={`shell ${collapsed ? "compact" : ""}`}>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <div className="brand-icon">
            <Briefcase size={23} />
          </div>
          {!collapsed && (
            <span>
              {tr("مدار", "Madar")}
              <small>CRM WORKSPACE</small>
            </span>
          )}
        </a>
        <div className="workspace">
          <div className="avatar">{activeTenant?.name?.slice(0, 1) ?? "+"}</div>
          {!collapsed && (
            <select
              aria-label="Organization"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="nav-label">
          {!collapsed && tr("فضای کاری شما", "YOUR WORKSPACE")}
        </div>
        <nav>
          {menus.map(([id, a, b, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              title={tr(a, b)}
              onClick={() => {
                setPage(id);
                setSearch("");
                setStatusFilter("");
              }}
            >
              <Icon size={20} />
              {!collapsed && <span>{tr(a, b)}</span>}
              {page === id && !collapsed && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="safe-card">
              <Shield size={18} />
              <strong>
                {tr("فضای امن شرکت شما", "Your private workspace")}
              </strong>
              <p>
                {tr(
                  "اطلاعات هر شرکت، مستقل و محافظت‌شده",
                  "Company data is independently protected",
                )}
              </p>
            </div>
          )}
          <button
            className="profile"
            onClick={async () => {
              await api("/auth/logout", "POST", {});
              setUser(null);
              setTenant("");
              setTenants([]);
            }}
          >
            <div className="avatar">{user.name?.slice(0, 1)}</div>
            {!collapsed && (
              <span>
                {user.name}
                <small>{tr("خروج از حساب", "Sign out")}</small>
              </span>
            )}
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <select
            className="mobile-page-select"
            aria-label="Mobile navigation"
            value={page}
            onChange={(e) => {
              setPage(e.target.value);
              setSearch("");
              setStatusFilter("");
            }}
          >
            {menus.map(([id, a, b]) => (
              <option key={id} value={id}>
                {tr(a, b)}
              </option>
            ))}
          </select>
          <div className="header-start">
            <button
              className="icon-button"
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <PanelRightClose size={21} />
            </button>
            <span className="breadcrumb">
              {tr("فضای کاری", "Workspace")} <ChevronLeft size={13} />{" "}
              {tr(label?.[1] ?? "", label?.[2] ?? "")}
            </span>
          </div>
          <div className="header-actions">
            {tenant && (
              <CommandPalette tenant={tenant} fa={fa} navigate={setPage} />
            )}
            {!operationPages.includes(page) && (
              <div className="search">
                <Search size={17} />
                <input
                  aria-label="Search"
                  placeholder={tr(
                    "جست‌وجو در این بخش…",
                    "Search this section…",
                  )}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(1);
                  }}
                />
              </div>
            )}
            <button
              className="icon-button"
              aria-label="Change language"
              onClick={() => setLang(fa ? "en" : "fa")}
            >
              <Globe size={19} />
            </button>
            <div className="avatar blue">{user.name?.slice(0, 1)}</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tr("رشد کسب‌وکار، با دید روشن", "CLARITY FOR YOUR BUSINESS")}
              </div>
              <h1>{tr(label?.[1] ?? "", label?.[2] ?? "")}</h1>
              <p>
                {page === "dashboard"
                  ? tr(
                      `${user.name}، به فضای کاری خود خوش آمدید. اطلاعات کسب‌وکارتان را یک‌جا ببینید.`,
                      `Welcome, ${user.name}. Your business at a glance.`,
                    )
                  : tr(
                      "اطلاعات تیم شما، همیشه مرتب و در دسترس",
                      "Your team’s information, organized and accessible",
                    )}
              </p>
            </div>
            <div className="heading-actions">
              <Button variant="outline" onClick={() => open("organization")}>
                {tr("شرکت جدید", "New organization")}
              </Button>
              {(fields[page] || page === "pipeline") && (
                <Button
                  onClick={() => open(page === "pipeline" ? "deals" : page)}
                >
                  <Plus size={17} />
                  {tr("افزودن جدید", "Add new")}
                </Button>
              )}
              {page === "team" && (
                <>
                  <Button variant="outline" onClick={() => open("role")}>
                    {tr("نقش جدید", "New role")}
                  </Button>
                  <Button onClick={() => open("invite")}>
                    <Plus size={17} />
                    {tr("دعوت عضو", "Invite member")}
                  </Button>
                </>
              )}
            </div>
          </div>
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setRefresh((x) => x + 1)}>
                {tr("تلاش مجدد", "Retry")}
              </button>
            </div>
          )}
          {tenant && operationPages.includes(page) ? (
            <Operations tenant={tenant} page={page} fa={fa} />
          ) : !tenant ? (
            <div className="setup-card">
              <div className="setup-icon">
                <Building2 size={38} />
              </div>
              <h2>
                {tr(
                  "اولین فضای کاری‌تان را بسازید",
                  "Create your first workspace",
                )}
              </h2>
              <p>
                {tr(
                  "یک شرکت بسازید و مدیریت مشتریان و فروش را شروع کنید.",
                  "Create an organization to start managing customers and sales.",
                )}
              </p>
              <Button onClick={() => open("organization")}>
                {tr("ایجاد شرکت", "Create organization")}
              </Button>
              <button className="text-button" onClick={() => open("accept")}>
                {tr("کد دعوت دارم", "I have an invitation code")}
              </button>
            </div>
          ) : busy && !data ? (
            <div className="skeleton-grid" aria-label="Loading">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton" />
              ))}
            </div>
          ) : (
            <>
              {page === "dashboard" && data && (
                <>
                  <div className="stats">
                    {[
                      ["accounts", "مشتریان فعال", "Customers", Building2],
                      ["contacts", "مخاطبان", "Contacts", Users],
                      ["leads", "سرنخ‌های فروش", "Sales leads", Target],
                      ["tasks", "وظایف باز", "Open tasks", CheckSquare],
                    ].map(([key, a, b, Icon]: any, i) => (
                      <article className="stat" key={key}>
                        <div className="stat-top">
                          <span>{tr(a, b)}</span>
                          <div className={`stat-icon c${i}`}>
                            <Icon size={20} />
                          </div>
                        </div>
                        <strong>
                          {Number(data[key] ?? 0).toLocaleString(
                            fa ? "fa-IR" : "en-US",
                          )}
                        </strong>
                        <div className="stat-foot">
                          <span className="live-dot" />
                          {tr("داده زنده شرکت شما", "Live organization data")}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <div>
                          <h2>
                            {tr("فرصت‌های در جریان", "Open opportunities")}
                          </h2>
                          <p>
                            {tr(
                              "ارزش فرصت‌های فروش، تفکیک‌شده بر اساس ارز",
                              "Pipeline value by currency",
                            )}
                          </p>
                        </div>
                        <KanbanSquare size={21} />
                      </div>
                      {data.totals?.length ? (
                        <div className="totals">
                          {data.totals.map((r: any) => (
                            <div key={r.currency}>
                              <span>{r.currency}</span>
                              <strong>
                                {Number(r.value).toLocaleString(
                                  fa ? "fa-IR" : "en-US",
                                )}
                              </strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          fa={fa}
                          title={tr(
                            "هنوز فرصتی ثبت نشده",
                            "No opportunities yet",
                          )}
                          onClick={() => setPage("pipeline")}
                          action={tr(
                            "ساخت اولین فرصت",
                            "Create your first opportunity",
                          )}
                        />
                      )}
                    </section>
                    <section className="panel quick">
                      <div className="panel-title">
                        <h2>{tr("دسترسی سریع", "Quick actions")}</h2>
                        <Activity size={21} />
                      </div>
                      {[
                        ["accounts", "ثبت مشتری", "Add a customer", Building2],
                        ["leads", "افزودن سرنخ", "Add a lead", Target],
                        ["tasks", "تعریف وظیفه", "Create a task", CheckSquare],
                      ].map(([k, a, b, I]: any) => (
                        <button key={k} onClick={() => open(k)}>
                          <div className="quick-icon">
                            <I size={20} />
                          </div>
                          <span>{tr(a, b)}</span>
                          <ArrowUpLeft size={17} />
                        </button>
                      ))}
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <h2>{tr("آخرین فعالیت‌ها", "Recent activity")}</h2>
                        <p>
                          {tr(
                            "تغییرات ثبت‌شده در فضای کاری شما",
                            "An audit trail of your workspace",
                          )}
                        </p>
                      </div>
                      <span className="badge">{tr("زنده", "LIVE")}</span>
                    </div>
                    {data.recent?.length ? (
                      <div className="timeline">
                        {data.recent.map((r: any, i: number) => (
                          <div key={i}>
                            <span className="event-dot" />
                            <strong>{r.resource}</strong>
                            <span>{r.action}</span>
                            <time>
                              {new Date(r.created_at).toLocaleString(
                                fa ? "fa-IR" : "en-US",
                              )}
                            </time>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        fa={fa}
                        title={tr("فعالیتی ثبت نشده", "No activity recorded")}
                      />
                    )}
                  </section>
                </>
              )}
              {fields[page] && (
                <section className="panel table-panel">
                  <div className="table-toolbar">
                    <strong>
                      {tr("فهرست", "All records")}{" "}
                      <span className="count">{data?.total ?? 0}</span>
                    </strong>
                    <div>
                      <select
                        aria-label="Sort"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="created_at">
                          {tr("جدیدترین", "Newest")}
                        </option>
                        <option value="name">{tr("نام", "Name")}</option>
                      </select>
                      {enums[page]?.status && (
                        <select
                          aria-label="Status filter"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <option value="">
                            {tr("همه وضعیت‌ها", "All statuses")}
                          </option>
                          {enums[page].status.map((v) => (
                            <option key={v} value={v}>
                              {fa ? (enumFa[v] ?? v) : v}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  {visibleRows.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {fields[page].slice(0, 5).map((k) => (
                              <th key={k}>
                                {fa ? faFields[k] : k.replaceAll("_", " ")}
                              </th>
                            ))}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((row: Row) => (
                            <tr key={row.id}>
                              {fields[page].slice(0, 5).map((k, i) => (
                                <td key={k}>
                                  {i === 0 ? (
                                    <button
                                      className="record-name"
                                      onClick={() => {
                                        setDetail(row);
                                      }}
                                    >
                                      <span
                                        className="avatar mini"
                                        aria-hidden="true"
                                      >
                                        {row.name.slice(0, 1)}
                                      </span>
                                      {row[k]}
                                    </button>
                                  ) : ["status", "kind"].includes(k) ? (
                                    <span className={`badge ${row[k]}`}>
                                      {fa ? (enumFa[row[k]] ?? row[k]) : row[k]}
                                    </span>
                                  ) : k === "account_id" ? (
                                    (references.accounts?.find(
                                      (r) => r.id === row[k],
                                    )?.name ?? "—")
                                  ) : (
                                    String(row[k] ?? "—")
                                  )}
                                </td>
                              ))}
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => open(page, row)}
                                >
                                  {tr("ویرایش", "Edit")}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      fa={fa}
                      title={tr(
                        search ? "نتیجه‌ای پیدا نشد" : "هنوز رکوردی ثبت نشده",
                        search ? "No results found" : "No records yet",
                      )}
                      onClick={() => open(page)}
                      action={tr("افزودن اولین رکورد", "Add your first record")}
                    />
                  )}
                  <div className="pagination">
                    <span>
                      {tr("صفحه", "Page")} {offset} · {data?.total ?? 0}{" "}
                      {tr("رکورد", "records")}
                    </span>
                    <div>
                      <button
                        disabled={offset <= 1}
                        onClick={() => setOffset((x) => x - 1)}
                      >
                        {tr("قبلی", "Previous")}
                      </button>
                      <button
                        disabled={offset * 25 >= (data?.total ?? 0)}
                        onClick={() => setOffset((x) => x + 1)}
                      >
                        {tr("بعدی", "Next")}
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {page === "pipeline" && (
                <>
                  <div className="pipeline-info">
                    <span className="badge">
                      {tr(
                        "حداکثر ۲۵ فرصت اخیر؛ مراحل با انتخاب تغییر می‌کنند",
                        "Latest 25 deals; use the stage selector to move",
                      )}
                    </span>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const name = prompt(
                          tr("نام قیف جدید", "New pipeline name"),
                        );
                        if (name) {
                          try {
                            await api(`/t/${tenant}/pipelines`, "POST", {
                              name,
                            });
                            setRefresh((x) => x + 1);
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }
                      }}
                    >
                      {tr("قیف جدید", "New pipeline")}
                    </Button>
                  </div>
                  {references.pipelines?.map((p) => (
                    <section key={p.id}>
                      <h2 className="pipeline-title">{p.name}</h2>
                      <div className="kanban">
                        {references.pipeline_stages
                          ?.filter((s) => s.pipeline_id === p.id)
                          .sort((a, b) => a.position - b.position)
                          .map((stage) => (
                            <div key={stage.id} className="kanban-column">
                              <div className="column-title">
                                <span className="stage-dot" />
                                {stage.name}
                                <span className="count">
                                  {data?.data?.filter(
                                    (d: Row) => d.stage_id === stage.id,
                                  ).length ?? 0}
                                </span>
                              </div>
                              {data?.data
                                ?.filter((d: Row) => d.stage_id === stage.id)
                                .map((d: Row) => (
                                  <article className="deal-card" key={d.id}>
                                    <button onClick={() => open("deals", d)}>
                                      <h3>{d.name}</h3>
                                    </button>
                                    <p>
                                      {references.accounts?.find(
                                        (a) => a.id === d.account_id,
                                      )?.name ??
                                        tr(
                                          "بدون مشتری مرتبط",
                                          "No linked customer",
                                        )}
                                    </p>
                                    <strong>
                                      {Number(d.value).toLocaleString(
                                        fa ? "fa-IR" : "en-US",
                                      )}{" "}
                                      <small>{d.currency}</small>
                                    </strong>
                                    <select
                                      aria-label={`Stage ${d.name}`}
                                      value={d.stage_id}
                                      onChange={async (e) => {
                                        try {
                                          await api(
                                            `/t/${tenant}/deals/${d.id}`,
                                            "PATCH",
                                            { stage_id: e.target.value },
                                          );
                                          setRefresh((x) => x + 1);
                                        } catch (e) {
                                          setError((e as Error).message);
                                        }
                                      }}
                                    >
                                      {references.pipeline_stages
                                        ?.filter((s) => s.pipeline_id === p.id)
                                        .map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.name}
                                          </option>
                                        ))}
                                    </select>
                                  </article>
                                ))}
                              <button
                                className="add-deal"
                                onClick={() =>
                                  open("deals", {
                                    id: "",
                                    pipeline_id: p.id,
                                    stage_id: stage.id,
                                  })
                                }
                              >
                                <Plus size={16} />
                                {tr("فرصت جدید", "New deal")}
                              </button>
                            </div>
                          ))}
                      </div>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const name = prompt(tr("نام مرحله", "Stage name"));
                          if (name) {
                            try {
                              await api(
                                `/t/${tenant}/pipeline_stages`,
                                "POST",
                                {
                                  name,
                                  pipeline_id: p.id,
                                  position: references.pipeline_stages.filter(
                                    (s) => s.pipeline_id === p.id,
                                  ).length,
                                },
                              );
                              setRefresh((x) => x + 1);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }
                        }}
                      >
                        {tr("مرحله جدید", "New stage")}
                      </Button>
                    </section>
                  ))}
                </>
              )}
              {page === "team" && data && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>{tr("اعضای شرکت", "Organization members")}</h2>
                    <Button variant="outline" onClick={() => open("accept")}>
                      {tr("پذیرش دعوت", "Accept invitation")}
                    </Button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{tr("نام", "Name")}</th>
                          <th>{tr("ایمیل", "Email")}</th>
                          <th>{tr("نقش", "Role")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.members?.map((m: Row) => (
                          <tr key={m.id}>
                            <td>{m.name}</td>
                            <td dir="ltr">{m.email}</td>
                            <td>
                              <select
                                aria-label={`Role ${m.name}`}
                                disabled={m.user_id === user.id}
                                value={m.role_id}
                                onChange={async (e) => {
                                  try {
                                    await api(
                                      `/t/${tenant}/memberships/${m.id}`,
                                      "PATCH",
                                      { role_id: e.target.value },
                                    );
                                    setRefresh((x) => x + 1);
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              >
                                {data.roles?.map((role: Row) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint">
                    {tr(
                      "دعوت‌ها به ایمیل مشخص محدودند؛ کد دعوت را مستقیماً برای همان فرد ارسال کنید.",
                      "Invitations are email-bound. Share the code directly with the intended user.",
                    )}
                  </p>
                </section>
              )}
              {page === "settings" && data && (
                <section className="panel settings-panel">
                  <h2>{tr("ترجیحات شرکت", "Organization preferences")}</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await api(
                          `/t/${tenant}/settings`,
                          "PATCH",
                          Object.fromEntries(new FormData(e.currentTarget)),
                        );
                        setNotice(tr("تنظیمات ذخیره شد", "Settings saved"));
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <label>
                      {tr("زبان پیش‌فرض", "Default language")}
                      <select name="locale" defaultValue={data.locale}>
                        <option value="fa">فارسی</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label>
                      {tr("واحد پول", "Currency")}
                      <select name="currency" defaultValue={data.currency}>
                        {["IRR", "USD", "EUR"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {tr("منطقه زمانی", "Timezone")}
                      <select name="timezone" defaultValue={data.timezone}>
                        <option>Asia/Tehran</option>
                        <option>UTC</option>
                      </select>
                    </label>
                    <Button type="submit">
                      {tr("ذخیره تغییرات", "Save changes")}
                    </Button>
                  </form>
                </section>
              )}
            </>
          )}
          <footer>
            {tr(
              "مدار • مدیریت ارتباط با مشتری",
              "Madar • Customer relationship management",
            )}
            <span>
              {tr("فضای کاری مستقل و امن", "Independent, secure workspace")}
            </span>
          </footer>
        </main>
      </div>
      <Dialog.Root
        open={!!modal}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            aria-describedby={undefined}
          >
            <div className="dialog-heading">
              <Dialog.Title>
                {tr(
                  edit?.id ? "ویرایش اطلاعات" : "افزودن به فضای کاری",
                  edit?.id ? "Edit record" : "Add to workspace",
                )}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-button" aria-label="Close">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={save} className="record-form">
              {(modal === "organization"
                ? ["name"]
                : modal === "invite"
                  ? ["email", "role_id"]
                  : modal === "accept"
                    ? ["code"]
                    : modal === "role"
                      ? ["name", "grants"]
                      : (fields[modal ?? ""] ?? [])
              ).map((k) => {
                const fieldLabel = fa
                  ? (faFields[k] ?? k)
                  : k.replaceAll("_", " ");
                const opts = enums[modal ?? ""]?.[k];
                let rows: Row[] | undefined;
                if (k === "account_id") rows = references.accounts;
                if (k === "pipeline_id") rows = references.pipelines;
                if (k === "stage_id")
                  rows = references.pipeline_stages?.filter(
                    (s) =>
                      !edit?.pipeline_id || s.pipeline_id === edit.pipeline_id,
                  );
                if (k === "role_id") rows = data?.roles;
                if (k === "grants")
                  return (
                    <fieldset key={k} className="permission-options">
                      <legend>
                        {tr("دسترسی‌های این نقش", "Role permissions")}
                      </legend>
                      {[
                        ["crm.read", "مشاهده اطلاعات", "Read CRM data"],
                        [
                          "crm.write",
                          "ثبت و ویرایش اطلاعات",
                          "Create and edit CRM data",
                        ],
                        [
                          "team.manage",
                          "مدیریت اعضا و نقش‌ها",
                          "Manage team and roles",
                        ],
                        [
                          "settings.manage",
                          "مدیریت تنظیمات شرکت",
                          "Manage organization settings",
                        ],
                        [
                          "ai.run",
                          "دسترسی به قابلیت‌های هوشمند آینده",
                          "Access future AI features",
                        ],
                      ].map(([key, a, b]) => (
                        <label key={key}>
                          <input
                            aria-label={tr(a, b)}
                            required={key === "crm.read"}
                            type="checkbox"
                            name="grants"
                            value={key}
                            defaultChecked={key === "crm.read"}
                          />
                          <span>{tr(a, b)}</span>
                        </label>
                      ))}
                    </fieldset>
                  );
                return (
                  <label key={k}>
                    {fa ? (faFields[k] ?? k) : k.replaceAll("_", " ")}
                    {rows ? (
                      <select
                        aria-label={fieldLabel}
                        required={k !== "account_id"}
                        name={k}
                        defaultValue={edit?.[k] ?? ""}
                        onChange={(e) => {
                          if (k === "pipeline_id")
                            setEdit((prev) => ({
                              ...prev,
                              id: prev?.id ?? "",
                              pipeline_id: e.target.value,
                            }));
                        }}
                      >
                        <option value="">{tr("انتخاب کنید", "Select")}</option>
                        {rows.map((r) => (
                          <option value={r.id} key={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : opts ? (
                      <select
                        aria-label={fieldLabel}
                        name={k}
                        defaultValue={edit?.[k] ?? opts[0]}
                      >
                        {opts.map((v) => (
                          <option key={v} value={v}>
                            {fa ? (enumFa[v] ?? v) : v}
                          </option>
                        ))}
                      </select>
                    ) : ["description", "body"].includes(k) ? (
                      <textarea
                        aria-label={fieldLabel}
                        name={k}
                        defaultValue={edit?.[k] ?? ""}
                        required={k === "body"}
                      />
                    ) : (
                      <input
                        aria-label={fieldLabel}
                        name={k}
                        type={
                          k === "email"
                            ? "email"
                            : ["value", "duration_seconds"].includes(k)
                              ? "number"
                              : ["due_at", "reminder_at"].includes(k)
                                ? "datetime-local"
                                : "text"
                        }
                        required={["name", "email", "code"].includes(k)}
                        min={k === "value" ? 0 : undefined}
                        defaultValue={
                          edit?.[k] ?? (k === "grants" ? "crm.read" : "")
                        }
                      />
                    )}
                  </label>
                );
              })}
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <div className="dialog-actions">
                <Button disabled={busy} type="submit">
                  {tr("ذخیره اطلاعات", "Save record")}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  {tr("انصراف", "Cancel")}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            aria-describedby={undefined}
          >
            <div className="dialog-heading">
              <Dialog.Title>{detail?.name}</Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-button" aria-label="Close">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <dl className="details">
              {detail &&
                Object.entries(detail)
                  .filter(([k]) => !["tenant_id", "id"].includes(k))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{fa ? (faFields[k] ?? k) : k}</dt>
                      <dd>{String(v ?? "—")}</dd>
                    </div>
                  ))}
            </dl>
            <Button
              onClick={() => {
                open(page, detail);
                setDetail(null);
              }}
            >
              {tr("ویرایش", "Edit")}
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
