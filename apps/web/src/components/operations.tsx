import React, { useEffect, useState } from "react";
import {
  Inbox,
  Mail,
  MessageSquare,
  Search,
  ArrowUpRight,
  Plus,
  CalendarDays,
  Workflow,
  Bell,
  Check,
  Sparkles,
  X,
  Command,
  ChevronRight,
  Building2,
} from "lucide-react";
import { api } from "../api";
import { Button } from "../../../../packages/ui/src/button";
type Row = { id: string; [key: string]: any };
export const operationPages = [
  "inbox",
  "calendar",
  "workflows",
  "notifications",
  "customer360",
];
export function Operations({
  tenant,
  page,
  fa,
}: {
  tenant: string;
  page: string;
  fa: boolean;
}) {
  const tr = (a: string, b: string) => (fa ? a : b);
  const base = `/t/${tenant}`;
  const [rows, setRows] = useState<Row[]>([]),
    [channels, setChannels] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [messages, setMessages] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [summary, setSummary] = useState(""),
    [filter, setFilter] = useState("all"),
    [form, setForm] = useState(false),
    [customer, setCustomer] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setSelected(null);
    setCustomer(null);
    const path =
      page === "customer360"
        ? "accounts?limit=100"
        : page === "workflows"
          ? "workflows?limit=100"
          : page;
    api(`${base}/${path}`)
      .then((r) => {
        if (live) {
          setRows(page === "inbox" ? r.conversations : (r.data ?? r));
          setChannels(r.channels ?? []);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [base, page, refresh]);
  useEffect(() => {
    let live = true;
    setMessages([]);
    setSummary("");
    if (selected && page === "inbox")
      api(`${base}/conversations/${selected.id}/thread`)
        .then((r) => live && setMessages(r.messages))
        .catch((e) => live && setError(e.message));
    if (selected && page === "customer360")
      api(`${base}/customers/${selected.id}/360`)
        .then((r) => live && setCustomer(r))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [base, selected, page]);
  async function execute(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    await execute(async () => {
      if (page === "inbox") {
        if (!channels.length) {
          await api(`${base}/channels`, "POST", { name: b.name, kind: b.kind });
        } else
          await api(`${base}/conversations`, "POST", {
            name: b.name,
            channel_id: b.channel_id,
            account_id: b.account_id || null,
            contact_id: b.contact_id || null,
            deal_id: b.deal_id || null,
          });
      }
      if (page === "workflows")
        await api(`${base}/workflows`, "POST", {
          name: b.name,
          trigger: b.trigger,
          condition_status: b.condition_status,
          action: b.action,
          enabled: false,
        });
      if (page === "calendar")
        await api(`${base}/tasks`, "POST", {
          name: b.name,
          due_at: new Date(String(b.due_at)).toISOString(),
          reminder_at: b.reminder_at
            ? new Date(String(b.reminder_at)).toISOString()
            : null,
        });
      setForm(false);
      setRefresh((x) => x + 1);
    });
  }
  return (
    <div className="operations">
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="ops-toolbar">
        <div className="ops-tabs">
          {(page === "inbox"
            ? ["all", "email", "sms", "whatsapp", "internal"]
            : ["all"]
          ).map((k) => (
            <button
              key={k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {
                (
                  {
                    all: tr("همه موارد", "All items"),
                    email: tr("ایمیل", "Email"),
                    sms: tr("پیامک", "SMS"),
                    whatsapp: tr("واتساپ", "WhatsApp"),
                    internal: tr("داخلی", "Internal"),
                  } as Record<string, string>
                )[k]
              }
            </button>
          ))}
        </div>
        {["inbox", "workflows", "calendar"].includes(page) && (
          <Button onClick={() => setForm(true)}>
            <Plus size={16} />
            {page === "inbox" && !channels.length
              ? tr("ایجاد کانال", "Create channel")
              : tr("ایجاد جدید", "Create new")}
          </Button>
        )}
      </div>
      {loading ? (
        <div className="ops-empty" role="status">
          {tr("در حال دریافت اطلاعات…", "Loading workspace…")}
        </div>
      ) : (
        <>
          {page === "inbox" && (
            <div className={"inbox-layout " + (selected ? "has-thread" : "")}>
              <div className="conversation-list">
                <div className="list-heading">
                  <Inbox size={17} />
                  <strong>{tr("مکالمه‌ها", "Conversations")}</strong>
                  <span>{rows.length}</span>
                </div>
                {rows
                  .filter((r) => filter === "all" || r.kind === filter)
                  .map((r) => (
                    <button
                      key={r.id}
                      className={
                        "conversation-card " +
                        (r.id === selected?.id ? "chosen" : "")
                      }
                      onClick={() => setSelected(r)}
                    >
                      <div className="conversation-avatar">
                        {r.kind === "email" ? (
                          <Mail size={18} />
                        ) : (
                          <MessageSquare size={18} />
                        )}
                      </div>
                      <div>
                        <div className="conversation-top">
                          <strong>{r.name}</strong>
                          <small>
                            {new Date(r.updated_at).toLocaleDateString(
                              fa ? "fa-IR" : "en-US",
                              { month: "short", day: "numeric" },
                            )}
                          </small>
                        </div>
                        <p>
                          {r.preview ||
                            tr("هنوز پیامی ثبت نشده", "No messages yet")}
                        </p>
                        <span className={"status-pill " + r.status}>
                          {r.channel_name} ·{" "}
                          {r.status === "open"
                            ? tr("باز", "Open")
                            : r.status === "pending"
                              ? tr("در انتظار", "Pending")
                              : tr("بسته", "Closed")}
                        </span>
                      </div>
                    </button>
                  ))}
                {!rows.length && (
                  <Empty
                    icon={<Inbox />}
                    title={tr("صندوق ورودی آماده است", "Your inbox is ready")}
                    text={tr(
                      "یک کانال تعریف کنید و اولین مکالمه مشتری را ثبت کنید.",
                      "Create a channel and record your first customer conversation.",
                    )}
                  />
                )}
              </div>
              <div className="thread-pane">
                {selected ? (
                  <>
                    <div className="thread-header">
                      <button
                        className="thread-back"
                        onClick={() => setSelected(null)}
                        aria-label="Back to conversations"
                      >
                        <ChevronRight />
                      </button>
                      <div>
                        <strong>{selected.name}</strong>
                        <small>
                          {selected.channel_name} ·{" "}
                          {tr("فضای ارتباط با مشتری", "Customer conversation")}
                        </small>
                      </div>
                      <select
                        aria-label="Conversation status"
                        value={selected.status}
                        onChange={(e) => {
                          const status = e.target.value;
                          void execute(async () => {
                            await api(
                              `${base}/conversations/${selected.id}`,
                              "PATCH",
                              { status },
                            );
                            setSelected({ ...selected, status });
                            setRows((rs) =>
                              rs.map((r) =>
                                r.id === selected.id ? { ...r, status } : r,
                              ),
                            );
                          });
                        }}
                      >
                        {["open", "pending", "closed"].map((s) => (
                          <option key={s} value={s}>
                            {s === "open"
                              ? tr("باز", "Open")
                              : s === "pending"
                                ? tr("در انتظار", "Pending")
                                : tr("بسته", "Closed")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="thread-messages">
                      {messages.map((m) => (
                        <article
                          key={m.id}
                          className={"message-bubble " + m.direction}
                        >
                          <span>
                            {m.direction === "draft"
                              ? tr("پیش‌نویس — ارسال نشده", "Draft — not sent")
                              : tr("یادداشت داخلی", "Internal note")}
                          </span>
                          <p>{m.body}</p>
                          <time>
                            {new Date(m.created_at).toLocaleString(
                              fa ? "fa-IR" : "en-US",
                            )}
                          </time>
                        </article>
                      ))}
                      {!messages.length && (
                        <Empty
                          icon={<MessageSquare />}
                          title={tr(
                            "شروع یک ارتباط بهتر",
                            "Start a better conversation",
                          )}
                          text={tr(
                            "یادداشت داخلی یا پیش‌نویس پیام را ثبت کنید.",
                            "Record an internal note or save a message draft.",
                          )}
                        />
                      )}
                    </div>
                    <form
                      className="composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget,
                          b = Object.fromEntries(new FormData(f));
                        void execute(async () => {
                          const r = await api(`${base}/messages`, "POST", {
                            conversation_id: selected.id,
                            body: b.body,
                            direction: b.direction,
                          });
                          setMessages((ms) => [...ms, r]);
                          f.reset();
                        });
                      }}
                    >
                      <textarea
                        name="body"
                        required
                        maxLength={20000}
                        aria-label="Message body"
                        placeholder={tr(
                          "یادداشت یا پیش‌نویس خود را بنویسید…",
                          "Write a note or draft…",
                        )}
                      />
                      <div>
                        <select name="direction" aria-label="Message type">
                          <option value="internal">
                            {tr("یادداشت داخلی", "Internal note")}
                          </option>
                          <option value="draft">
                            {tr("پیش‌نویس پیام", "Message draft")}
                          </option>
                        </select>
                        <Button type="submit">
                          {tr("ذخیره", "Save")}
                          <ArrowUpRight size={15} />
                        </Button>
                      </div>
                      <small>
                        {tr(
                          "ارسال بیرونی غیرفعال است؛ هیچ پیامی به مشتری ارسال نمی‌شود.",
                          "External delivery is disabled. No message will be sent to the customer.",
                        )}
                      </small>
                    </form>
                  </>
                ) : (
                  <Empty
                    icon={<MessageSquare size={38} />}
                    title={tr(
                      "هر ارتباط، یک فرصت تازه",
                      "Every conversation is an opportunity",
                    )}
                    text={tr(
                      "برای مشاهده جزئیات، مکالمه‌ای را انتخاب کنید.",
                      "Select a conversation to see its full context.",
                    )}
                  />
                )}
              </div>
              <aside className="context-pane">
                <div className="context-icon">
                  <Sparkles />
                </div>
                <h3>{tr("همراه مکالمه", "Conversation companion")}</h3>
                <p>
                  {tr(
                    "زمینه ارتباط را مرور کنید و قدم بعدی را با تصمیم خودتان بردارید.",
                    "Review the context and choose the next best step.",
                  )}
                </p>
                {selected && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void execute(async () => {
                          const r = await api(
                            `${base}/conversations/${selected.id}/summary`,
                            "POST",
                          );
                          setSummary(
                            (r.mode === "model"
                              ? tr(
                                  "پیشنهاد مدل — نیازمند بررسی انسانی\n",
                                  "Model suggestion — human review required\n",
                                )
                              : "") + r.summary ||
                              tr(
                                "متنی برای مرور وجود ندارد.",
                                "No text to review.",
                              ),
                          );
                        })
                      }
                    >
                      {tr("مرور متن مکالمه", "Review conversation text")}
                    </Button>
                    <small>
                      {tr(
                        "خلاصه استخراجی محلی؛ مدل زبانی متصل نیست.",
                        "Local extractive preview. No language model connected.",
                      )}
                    </small>
                    <p className="summary-preview">{summary}</p>
                    <div className="context-divider" />
                    <label>{tr("مشتری مرتبط", "Linked customer")}</label>
                    <p>
                      {selected.account_id
                        ? tr(
                            "این مکالمه به پرونده مشتری متصل است.",
                            "This conversation is linked to a customer.",
                          )
                        : tr("مشتری متصل نشده", "No linked customer")}
                    </p>
                  </>
                )}
              </aside>
            </div>
          )}
          {page === "calendar" && (
            <div className="agenda-grid">
              <div className="agenda-intro">
                <CalendarDays size={32} />
                <h2>
                  {tr("زمان برای کارهای مهم", "Make time for what matters")}
                </h2>
                <p>
                  {tr(
                    "برنامه پیگیری‌ها و وظایف تیم در یک نگاه.",
                    "Your follow-ups and team tasks, in one place.",
                  )}
                </p>
                <strong>
                  {rows.filter((r) => r.status !== "done").length}
                </strong>
                <span>
                  {tr("وظیفه برنامه‌ریزی‌شده باز", "open scheduled tasks")}
                </span>
              </div>
              <div className="agenda-list">
                {rows.map((r) => (
                  <article key={r.id}>
                    <div className="date-tile">
                      <strong>
                        {new Date(r.due_at).toLocaleDateString(
                          fa ? "fa-IR" : "en-US",
                          { day: "numeric" },
                        )}
                      </strong>
                      <span>
                        {new Date(r.due_at).toLocaleDateString(
                          fa ? "fa-IR" : "en-US",
                          { month: "short" },
                        )}
                      </span>
                    </div>
                    <div>
                      <h3>{r.name}</h3>
                      <p>
                        {new Date(r.due_at).toLocaleString(
                          fa ? "fa-IR" : "en-US",
                        )}
                      </p>
                      <span>{r.description}</span>
                    </div>
                    <button
                      aria-label="Complete task"
                      disabled={r.status === "done"}
                      onClick={() =>
                        void execute(async () => {
                          await api(`${base}/tasks/${r.id}`, "PATCH", {
                            status: "done",
                          });
                          setRefresh((x) => x + 1);
                        })
                      }
                    >
                      <Check size={19} />
                    </button>
                  </article>
                ))}
                {!rows.length && (
                  <Empty
                    icon={<CalendarDays />}
                    title={tr("برنامه شما خلوت است", "A clear schedule")}
                    text={tr(
                      "اولین پیگیری را برنامه‌ریزی کنید.",
                      "Schedule your first follow-up.",
                    )}
                  />
                )}
              </div>
            </div>
          )}
          {page === "workflows" && (
            <div className="workflow-grid">
              {rows.map((r) => (
                <article className="workflow-card" key={r.id}>
                  <div className="workflow-title">
                    <div className="context-icon">
                      <Workflow />
                    </div>
                    <span
                      className={
                        "status-pill " + (r.enabled ? "open" : "pending")
                      }
                    >
                      {r.enabled
                        ? tr("فعال", "Active")
                        : tr("پیش‌نویس", "Draft")}
                    </span>
                  </div>
                  <h3>{r.name}</h3>
                  <div className="workflow-node">
                    <small>01 · {tr("وقتی", "WHEN")}</small>
                    <strong>
                      {r.trigger === "manual"
                        ? tr("اجرای دستی", "Manual execution")
                        : tr("مکالمه جدید", "Conversation created")}
                    </strong>
                  </div>
                  <div className="node-line" />
                  <div className="workflow-node">
                    <small>02 · {tr("اگر", "IF")}</small>
                    <strong>
                      {tr("وضعیت مکالمه", "Conversation status")} ={" "}
                      {r.condition_status}
                    </strong>
                  </div>
                  <div className="node-line" />
                  <div className="workflow-node action">
                    <small>03 · {tr("آنگاه", "THEN")}</small>
                    <strong>
                      {r.action === "task.create"
                        ? tr("ایجاد وظیفه پیگیری", "Create follow-up task")
                        : tr(
                            "اعلان درون‌برنامه‌ای",
                            "Create in-app notification",
                          )}
                    </strong>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void execute(async () => {
                        await api(`${base}/workflows/${r.id}`, "PATCH", {
                          enabled: !r.enabled,
                        });
                        setRefresh((x) => x + 1);
                      })
                    }
                  >
                    {r.enabled
                      ? tr("توقف", "Pause")
                      : tr("فعال‌سازی", "Activate")}
                  </Button>
                </article>
              ))}
              {!rows.length && (
                <Empty
                  icon={<Workflow />}
                  title={tr("فرآیندهای منظم‌تر", "Build a smoother process")}
                  text={tr(
                    "یک جریان با محرک، شرط و اقدام داخلی بسازید.",
                    "Create a workflow with a trigger, condition and internal action.",
                  )}
                />
              )}
            </div>
          )}
          {page === "notifications" && (
            <div className="notification-list">
              {rows.map((r) => (
                <button
                  className={r.read_at ? "read" : ""}
                  key={r.id}
                  onClick={() =>
                    void execute(async () => {
                      await api(`${base}/notifications/${r.id}/read`, "POST");
                      setRefresh((x) => x + 1);
                    })
                  }
                >
                  <Bell size={20} />
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      {new Date(r.created_at).toLocaleString(
                        fa ? "fa-IR" : "en-US",
                      )}
                    </small>
                  </div>
                  {r.read_at && <Check size={16} />}
                </button>
              ))}
              {!rows.length && (
                <Empty
                  icon={<Bell />}
                  title={tr("همه‌چیز مرتب است", "You’re all caught up")}
                  text={tr(
                    "اعلان‌های تازه اینجا نمایش داده می‌شوند.",
                    "New notifications will appear here.",
                  )}
                />
              )}
            </div>
          )}
          {page === "customer360" && (
            <div className="customer-layout">
              <div className="customer-selector">
                {rows.map((r) => (
                  <button
                    className={selected?.id === r.id ? "chosen" : ""}
                    key={r.id}
                    onClick={() => setSelected(r)}
                  >
                    <Building2 size={19} />
                    {r.name}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <div>
                {customer ? (
                  <>
                    <div className="customer-hero">
                      <div className="customer-monogram">
                        {customer.customer.name.slice(0, 1)}
                      </div>
                      <h2>{customer.customer.name}</h2>
                      <p>
                        {customer.customer.email} · {customer.customer.phone}
                      </p>
                      <p>{customer.customer.description}</p>
                    </div>
                    <div className="customer-sections">
                      {[
                        "conversations",
                        "deals",
                        "tasks",
                        "contacts",
                        "call_logs",
                        "notes",
                        "activities",
                      ].map((k) => (
                        <section key={k}>
                          <h3>
                            {
                              (
                                {
                                  conversations: tr(
                                    "مکالمه‌ها",
                                    "Conversations",
                                  ),
                                  deals: tr("فرصت‌ها", "Deals"),
                                  tasks: tr("وظایف", "Tasks"),
                                  contacts: tr("مخاطبان", "Contacts"),
                                  call_logs: tr("تماس‌ها", "Calls"),
                                  notes: tr("یادداشت‌ها", "Notes"),
                                  activities: tr("فعالیت‌ها", "Activities"),
                                } as Record<string, string>
                              )[k]
                            }
                            <span>{customer[k].length}</span>
                          </h3>
                          {customer[k].map((r: Row) => (
                            <article key={r.id}>
                              <strong>{r.name}</strong>
                              <p>
                                {r.body || r.description || r.status || r.email}
                              </p>
                            </article>
                          ))}
                        </section>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty
                    icon={<Building2 />}
                    title={tr(
                      "شناخت کامل‌تر از مشتری",
                      "A complete customer picture",
                    )}
                    text={tr(
                      "مشتری را برای مرور ارتباطات و فرصت‌ها انتخاب کنید.",
                      "Choose a customer to review relationships and opportunities.",
                    )}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
      {form && (
        <div className="ops-modal-overlay" onClick={() => setForm(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={tr("ایجاد جدید", "Create new")}
            className="ops-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setForm(false)}
            >
              <X />
            </button>
            <h2>{tr("یک قدم تازه", "Create something new")}</h2>
            <form onSubmit={save}>
              <label>
                {tr("عنوان", "Title")}
                <input name="name" required maxLength={200} autoFocus />
              </label>
              {page === "inbox" &&
                (channels.length ? (
                  <>
                    <label>
                      {tr("کانال", "Channel")}
                      <select name="channel_id">
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <RelationshipFields base={base} fa={fa} />
                  </>
                ) : (
                  <label>
                    {tr("نوع کانال", "Channel type")}
                    <select name="kind">
                      {["email", "sms", "whatsapp", "internal"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                ))}
              {page === "calendar" && (
                <>
                  <label>
                    {tr("موعد", "Due date")}
                    <input required type="datetime-local" name="due_at" />
                  </label>
                  <label>
                    {tr("یادآوری", "Reminder")}
                    <input type="datetime-local" name="reminder_at" />
                  </label>
                </>
              )}
              {page === "workflows" && (
                <>
                  <label>
                    {tr("محرک", "Trigger")}
                    <select name="trigger">
                      <option value="manual">{tr("دستی", "Manual")}</option>
                      <option value="conversation.created">
                        {tr("مکالمه جدید", "Conversation created")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {tr("شرط وضعیت", "Status condition")}
                    <select name="condition_status">
                      {["open", "pending", "closed"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("اقدام", "Action")}
                    <select name="action">
                      <option value="task.create">
                        {tr("ایجاد وظیفه", "Create task")}
                      </option>
                      <option value="notification.create">
                        {tr("ایجاد اعلان", "Create notification")}
                      </option>
                    </select>
                  </label>
                </>
              )}
              <Button type="submit">{tr("ذخیره", "Save")}</Button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="ops-empty">
      <div className="empty-orbit">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function RelationshipFields({ base, fa }: { base: string; fa: boolean }) {
  const [refs, setRefs] = useState<Record<string, Row[]>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const tables = ["accounts", "contacts", "deals"];
    Promise.all(tables.map((t) => api(`${base}/${t}?limit=100`)))
      .then(
        (results) =>
          live &&
          setRefs(
            Object.fromEntries(tables.map((t, i) => [t, results[i].data])),
          ),
      )
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [base]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {[
        ["accounts", "account_id", fa ? "مشتری مرتبط" : "Linked customer"],
        ["contacts", "contact_id", fa ? "مخاطب مرتبط" : "Linked contact"],
        ["deals", "deal_id", fa ? "فرصت مرتبط" : "Linked deal"],
      ].map(([table, key, label]) => (
        <label key={key}>
          {label}
          <select name={key}>
            <option value="">—</option>
            {(refs[table] ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </>
  );
}
export function CommandPalette({
  tenant,
  fa,
  navigate,
}: {
  tenant: string;
  fa: boolean;
  navigate: (page: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((x) => !x);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    let live = true;
    setRows([]);
    setError("");
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => {
      api(`/t/${tenant}/search?q=${encodeURIComponent(q)}`)
        .then((r) => live && setRows(r))
        .catch((e) => live && setError(e.message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, tenant]);
  return (
    <>
      <button className="command-launch" onClick={() => setOpen(true)}>
        <Search size={17} />
        <span>{fa ? "جست‌وجو در فضای کاری…" : "Search workspace…"}</span>
        <kbd>⌘ K</kbd>
      </button>
      {open && (
        <div className="ops-modal-overlay" onClick={() => setOpen(false)}>
          <section
            className="command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-input">
              <Search size={20} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Global search"
                placeholder={
                  fa
                    ? "جست‌وجوی مشتری، وظیفه، مکالمه…"
                    : "Search customers, tasks, conversations…"
                }
              />
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            <div className="command-results">
              {rows.map((r) => (
                <button
                  key={r.type + r.id}
                  onClick={() => {
                    navigate(
                      r.type === "deals"
                        ? "pipeline"
                        : r.type === "conversations"
                          ? "inbox"
                          : r.type,
                    );
                    setOpen(false);
                  }}
                >
                  <Command size={16} />
                  <strong>{r.name}</strong>
                  <small>{r.type}</small>
                </button>
              ))}
              {q.length >= 2 && !rows.length && (
                <p>{fa ? "نتیجه‌ای یافت نشد" : "No results found"}</p>
              )}
              {q.length < 2 &&
                [
                  ["inbox", fa ? "صندوق ورودی" : "Inbox"],
                  ["calendar", fa ? "تقویم" : "Calendar"],
                  ["workflows", fa ? "جریان‌های کاری" : "Workflows"],
                  ["customer360", fa ? "نمای ۳۶۰ مشتری" : "Customer 360"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => {
                      navigate(k);
                      setOpen(false);
                    }}
                  >
                    <ArrowUpRight size={16} />
                    {label}
                  </button>
                ))}
            </div>
            <footer>
              {fa
                ? "جست‌وجوی امن در اطلاعات همین شرکت"
                : "Search scoped to your current organization"}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
