import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Task = { id: string; name: string; due_at: string; status: string };
function calendarParts(date: Date, fa: boolean) {
  return Object.fromEntries(
    new Intl.DateTimeFormat(fa ? "en-US-u-ca-persian" : "en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
function startOfMonth(anchor: Date, fa: boolean) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Number(calendarParts(d, fa).day) + 1);
  return d;
}
export function CalendarGrid({ tasks, fa }: { tasks: Task[]; fa: boolean }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const { days, start, next } = useMemo(() => {
    const start = startOfMonth(anchor, fa),
      month = calendarParts(start, fa).month,
      days: Date[] = [];
    const d = new Date(start);
    while (calendarParts(d, fa).month === month) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return { days, start, next: new Date(d) };
  }, [anchor, fa]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    const k = key(new Date(task.due_at));
    byDate.set(k, [...(byDate.get(k) ?? []), task]);
  }
  const active = selected ? (byDate.get(selected) ?? []) : [];
  const weekdays = fa
    ? ["ش", "ی", "د", "س", "چ", "پ", "ج"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className="calendar-card">
      <div className="calendar-card-heading">
        <div>
          <small>{fa ? "تقویم پیگیری‌ها" : "FOLLOW-UP CALENDAR"}</small>
          <h2>
            {anchor.toLocaleDateString(fa ? "fa-IR" : "en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        <div>
          <button
            aria-label="Previous month"
            onClick={() => {
              const previous = new Date(start);
              previous.setDate(previous.getDate() - 1);
              setAnchor(previous);
              setSelected(null);
            }}
          >
            <ChevronRight size={19} />
          </button>
          <button
            onClick={() => {
              setAnchor(new Date());
              setSelected(null);
            }}
          >
            {fa ? "امروز" : "Today"}
          </button>
          <button
            aria-label="Next month"
            onClick={() => {
              setAnchor(next);
              setSelected(null);
            }}
          >
            <ChevronLeft size={19} />
          </button>
        </div>
      </div>
      <div className="month-grid">
        {weekdays.map((label, i) => (
          <span className="weekday" key={i}>
            {label}
          </span>
        ))}
        {Array.from(
          { length: fa ? (start.getDay() + 1) % 7 : start.getDay() },
          (_, i) => (
            <div className="calendar-padding" key={"pad" + i} />
          ),
        )}
        {days.map((d) => {
          const k = key(d),
            list = byDate.get(k) ?? [];
          return (
            <button
              key={k}
              className={
                (k === key(new Date()) ? "today " : "") +
                (selected === k ? "selected" : "")
              }
              onClick={() => setSelected(k)}
              aria-label={
                d.toLocaleDateString(fa ? "fa-IR" : "en-US") +
                `, ${list.length} tasks`
              }
            >
              <span>
                {d.toLocaleDateString(fa ? "fa-IR" : "en-US", {
                  day: "numeric",
                })}
              </span>
              {list.slice(0, 2).map((task) => (
                <small
                  className={task.status === "done" ? "complete" : ""}
                  key={task.id}
                >
                  {task.name}
                </small>
              ))}
              {list.length > 2 && <em>+{list.length - 2}</em>}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="calendar-day-detail">
          {active.length ? (
            active.map((t) => (
              <p key={t.id}>
                {t.name} ·{" "}
                {new Date(t.due_at).toLocaleTimeString(fa ? "fa-IR" : "en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ))
          ) : (
            <p>
              {fa
                ? "برای این روز وظیفه‌ای ثبت نشده است."
                : "No tasks scheduled for this day."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
