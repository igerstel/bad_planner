import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  GripVertical,
  Leaf,
  LoaderCircle,
  LogOut,
  Minus,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";

type Event = { id: string; name: string; start: number; end: number };
type Schedule = { events: Event[]; version: number };
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const label = (n: number) =>
  n === 1440
    ? "Midnight"
    : new Date(2000, 0, 1, Math.floor(n / 60), n % 60).toLocaleTimeString(
        "en-US",
        { hour: "numeric", minute: "2-digit" },
      );
const duration = (n: number) =>
  `${Math.floor(n / 60) ? `${Math.floor(n / 60)}h ` : ""}${n % 60 ? `${n % 60}m` : ""}`.trim();
const sample: Event[] = [
  { id: "demo-1", name: "A slow start & breakfast", start: 480, end: 540 },
  { id: "demo-2", name: "Make a little progress", start: 570, end: 660 },
  { id: "demo-3", name: "Get outside", start: 690, end: 735 },
  { id: "demo-4", name: "Lunch, away from the desk", start: 750, end: 810 },
  { id: "demo-5", name: "One thing at a time", start: 840, end: 930 },
  { id: "demo-6", name: "Wrap up & wind down", start: 990, end: 1035 },
];
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
  intent?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(version !== undefined ? { "If-Match": String(version) } : {}),
      ...(intent ? { "X-Edit-Intent": intent } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error || "Something went wrong. Please try again.",
      response.status,
    );
  return data;
}
// The client mirrors the cascade for preview only. Saved results always come from Go.
function preview(events: Event[], edited: Event, up = false): Event[] | null {
  const rest = events
    .filter((e) => e.id !== edited.id)
    .map((e) => ({ ...e }))
    .sort((a, b) => a.start - b.start);
  let cursor = up ? edited.start : edited.end;
  for (const e of up ? [...rest].reverse() : rest) {
    if (up) {
      if (e.start >= edited.end) continue;
      if (e.end > cursor) {
        const d = e.end - e.start;
        e.end = cursor;
        e.start = cursor - d;
      }
      cursor = e.start;
    } else {
      if (e.end <= edited.start) continue;
      if (e.start < cursor) {
        const d = e.end - e.start;
        e.start = cursor;
        e.end = cursor + d;
      }
      cursor = e.end;
    }
  }
  if (
    rest.some((e) => e.start < 0 || e.end > 1440) ||
    edited.start < 0 ||
    edited.end > 1440
  )
    return null;
  return [...rest, edited].sort((a, b) => a.start - b.start);
}
export default function App() {
  const [user, setUser] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>({
      events: [],
      version: 0,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [auth, setAuth] = useState<"login" | "register" | null>(null),
    [editing, setEditing] = useState<Event | null>(null),
    [dragged, setDragged] = useState<Event[] | null>(null);
  const [fullDay, setFullDay] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    locked = useRef(false);
  const drag = useRef<{
    event: Event;
    y: number;
    latest: Event;
    moved: boolean;
    valid: boolean;
    pointerY: number;
    scrollY: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ email: string }>("/me")
      .then(async (u) => {
        const s = await api<Schedule>("/events");
        if (active) {
          setUser(u.email);
          setSchedule(s);
        }
      })
      .catch((e) => {
        if (active && (!(e instanceof ApiError) || e.status !== 401))
          setError(
            "The server is unavailable. You can explore the demo while it starts.",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if ((user || demo) && scroll.current)
      scroll.current.scrollTop = fullDay ? 7 * 96 : 96;
  }, [user, demo, fullDay]);
  async function signOut() {
    if (locked.current) return;
    try {
      await api("/logout", "POST");
      setUser(null);
      setSchedule({ events: [], version: 0 });
      setError("");
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function mutate(e: Event, method = "PUT", intent = "resize") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let next: Schedule;
      if (demo) {
        let list = schedule.events;
        if (method === "DELETE") list = list.filter((x) => x.id !== e.id);
        else {
          const edited = {
            ...e,
            id: method === "POST" ? crypto.randomUUID() : e.id,
          };
          const old = list.find((x) => x.id === e.id);
          const up =
            !!old && edited.start < old.start && edited.end === old.end;
          const result =
            preview(list, edited, up) ||
            (intent === "move" ? preview(list, edited, true) : null);
          if (!result)
            throw new Error(
              "There isn’t enough room in this day. Choose another time.",
            );
          list = result;
        }
        next = { events: list, version: schedule.version + 1 };
      } else
        next = await api<Schedule>(
          method === "POST" ? "/events" : `/events/${e.id}`,
          method,
          method === "DELETE"
            ? undefined
            : { name: e.name, start: e.start, end: e.end },
          schedule.version,
          intent,
        );
      const shifted = next.events.filter(
        (x) =>
          x.id !== e.id &&
          schedule.events.some(
            (old) => old.id === x.id && old.start !== x.start,
          ),
      ).length;
      setSchedule(next);
      setEditing(null);
      setNotice(
        method === "DELETE"
          ? "Event removed. A little more breathing room."
          : `${demo ? "Demo updated" : "Saved"}${shifted ? ` · ${shifted} ${shifted === 1 ? "event moved" : "events moved"} to make room` : ""}`,
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        try {
          setSchedule(await api<Schedule>("/events"));
        } catch {
          setError("Could not reload. Refresh before editing again.");
        }
      }
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setAuth("login");
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function updateDrag(y: number) {
    const d = drag.current;
    if (!d) return;
    const delta =
      Math.round(
        (y - d.y + (scroll.current?.scrollTop || 0) - d.scrollY) / 24,
      ) * 15;
    const start = Math.max(
      0,
      Math.min(1440 - (d.event.end - d.event.start), d.event.start + delta),
    );
    if (start === d.latest.start) return;
    d.latest = { ...d.event, start, end: start + d.event.end - d.event.start };
    d.moved = start !== d.event.start;
    const result =
      preview(schedule.events, d.latest) ||
      preview(schedule.events, d.latest, true);
    d.valid = !!result;
    setDragged(result);
    setError(result ? "" : "There isn’t enough room at that time.");
  }
  function startDrag(ev: PointerEvent<HTMLButtonElement>, event: Event) {
    if (busy) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = {
      event,
      y: ev.clientY,
      latest: event,
      moved: false,
      valid: true,
      pointerY: ev.clientY,
      scrollY: scroll.current?.scrollTop || 0,
    };
    const tick = () => {
      const d = drag.current,
        container = scroll.current;
      if (!d || !container) return;
      const rect = container.getBoundingClientRect();
      const speed =
        d.pointerY < rect.top + 40 ? -7 : d.pointerY > rect.bottom - 40 ? 7 : 0;
      if (speed) {
        container.scrollTop += speed;
        updateDrag(d.pointerY);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function moveDrag(ev: PointerEvent<HTMLButtonElement>) {
    if (drag.current) {
      drag.current.pointerY = ev.clientY;
      updateDrag(ev.clientY);
    }
  }
  function endDrag() {
    const d = drag.current;
    drag.current = null;
    setDragged(null);
    if (d?.moved && d.valid) void mutate(d.latest, "PUT", "move");
  }
  const events = dragged || schedule.events,
    planned = schedule.events.reduce((n, e) => n + e.end - e.start, 0),
    startHour = fullDay ? 0 : 6,
    endHour = fullDay ? 24 : 22;
  const add = () => {
    let start = 540;
    for (const e of schedule.events) {
      if (e.end <= start) continue;
      if (e.start >= start + 30) break;
      start = e.end;
    }
    if (start > 1410) start = 1380;
    setEditing({ id: "", name: "", start, end: start + 30 });
  };
  return (
    <div className="app">
      <aside className="sidebar" inert={!!(auth || editing)}>
        <a className="brand" href="/" aria-label="bad planner home">
          <span className="brand-mark">
            b<span>p</span>
            <i />
          </span>
          <span>
            bad_planner
            <span className="brand-caption">a little room to move</span>
          </span>
        </a>
        <div className="workspace-label">YOUR SPACE</div>
        <div className="nav-item">
          <Repeat2 size={18} /> My everyday <ChevronRight size={16} />
        </div>
        <div className="nav-soon">
          <span>Weekly view</span>
          <small>coming later</small>
        </div>
        <div className="sidebar-note">
          <Leaf size={23} />
          <h3>
            Plans can change.
            <br />
            You’re still doing okay.
          </h3>
          <p>
            A schedule is a starting point.
            <br />
            Make it work for you.
          </p>
        </div>
        <div className="account">
          {user ? (
            <>
              <span className="avatar">{user[0].toUpperCase()}</span>
              <span className="email">{user}</span>
              <button
                className="icon"
                aria-label="Sign out"
                disabled={busy}
                onClick={signOut}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <>
              <span className="avatar">{demo ? "D" : "↗"}</span>
              <span>{demo ? "Your demo space" : "Make yourself at home"}</span>
            </>
          )}
        </div>
      </aside>
      <main inert={!!(auth || editing)}>
        <header className="topbar">
          <span>
            <span className="dot" /> A fresh start, every day
          </span>
          <div>
            {demo && (
              <span className="demo-tag">Demo · changes aren’t saved</span>
            )}
            {user ? (
              <span className="save-status">
                {busy ? (
                  <>
                    <LoaderCircle size={14} className="spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check size={14} />{" "}
                    {error ? "Save needs attention" : "All changes saved"}
                  </>
                )}
              </span>
            ) : (
              <button className="text-button" onClick={() => setAuth("login")}>
                Log in <ArrowUpRight size={15} />
              </button>
            )}
            {user && (
              <button
                className="icon mobile-signout"
                aria-label="Sign out"
                title="Sign out"
                disabled={busy}
                onClick={signOut}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>
        <section className="page-heading">
          <div className="eyebrow">LESS PRESSURE. MORE POSSIBILITY.</div>
          <div className="title-row">
            <div>
              <h1>
                Your day, with wiggle room<span>.</span>
              </h1>
              <p>Things run late. Move them around. Keep going.</p>
            </div>
            {(user || demo) && (
              <button className="primary" disabled={busy} onClick={add}>
                <Plus size={18} /> Add an event
              </button>
            )}
          </div>
        </section>
        {!ready ? (
          <div className="welcome">
            <LoaderCircle className="spin" /> Getting your space ready…
          </div>
        ) : !user && !demo ? (
          <section className="welcome">
            <div className="welcome-icon">
              <Repeat2 size={30} />
            </div>
            <h2>A plan that bends with you.</h2>
            <p>
              Build one everyday routine. When life happens, drag an event
              <br />
              and the rest gently makes room.
            </p>
            <div className="welcome-actions">
              <button className="primary" onClick={() => setAuth("register")}>
                Create your space <ArrowUpRight size={17} />
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setDemo(true);
                  setSchedule({
                    events: sample.map((e) => ({ ...e })),
                    version: 0,
                  });
                  setError("");
                }}
              >
                Try the interactive demo
              </button>
            </div>
            <small>No perfect days required.</small>
          </section>
        ) : (
          <>
            <div className="overview">
              <div>
                <span className="stat-icon">
                  <Repeat2 size={19} />
                </span>
                <div>
                  <strong>My everyday</strong>
                  <span>Your repeating daily routine</span>
                </div>
              </div>
              <div>
                <strong>
                  {schedule.events.length}
                  <span> events</span>
                </strong>
                <small>
                  {duration(planned) || "0m"} planned ·{" "}
                  {duration(1440 - planned)} open
                </small>
              </div>
              <div className="flex-label">
                <Leaf size={16} /> Built to be flexible
              </div>
            </div>
            <section className="calendar-card">
              <div className="calendar-toolbar">
                <div>
                  <h2>The everyday plan</h2>
                  <span>
                    <Repeat2 size={13} /> Repeats daily
                  </span>
                </div>
                <button
                  className="secondary compact"
                  onClick={() => setFullDay(!fullDay)}
                >
                  {fullDay ? "Focus on 6am–10pm" : "Show all 24 hours"}
                </button>
              </div>
              <div className="calendar-scroll" ref={scroll}>
                <div
                  className="timeline"
                  style={{ height: (endHour - startHour) * 96 }}
                  onDoubleClick={(ev) => {
                    if ((ev.target as HTMLElement).closest(".event")) return;
                    const rect = ev.currentTarget.getBoundingClientRect();
                    const start =
                      Math.floor((ev.clientY - rect.top) / 24) * 15 +
                      startHour * 60;
                    setEditing({
                      id: "",
                      name: "",
                      start,
                      end: Math.min(1440, start + 30),
                    });
                  }}
                >
                  {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
                    <div className="hour" style={{ top: i * 96 }} key={i}>
                      <span>{label((startHour + i) * 60)}</span>
                      <div />
                    </div>
                  ))}
                  <div className="quarter-grid" />
                  {events
                    .filter(
                      (e) => e.end > startHour * 60 && e.start < endHour * 60,
                    )
                    .map((e) => (
                      <div
                        key={e.id}
                        className={`event tone-${(schedule.events.findIndex((x) => x.id === e.id) + 6) % 4} ${drag.current?.event.id === e.id ? "dragging" : ""} ${e.end - e.start === 15 ? "short" : ""}`}
                        style={{
                          top:
                            (Math.max(e.start, startHour * 60) -
                              startHour * 60) *
                            1.6,
                          height:
                            (Math.min(e.end, endHour * 60) -
                              Math.max(e.start, startHour * 60)) *
                              1.6 -
                            3,
                        }}
                      >
                        <button
                          className="grip"
                          aria-label={`Move ${e.name}; arrow keys move 15 minutes`}
                          title="Drag to move · ↑ ↓ for 15-minute moves"
                          disabled={busy}
                          onPointerDown={(ev) => startDrag(ev, e)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={() => {
                            drag.current = null;
                            setDragged(null);
                          }}
                          onKeyDown={(ev) => {
                            if (
                              ev.key === "ArrowUp" ||
                              ev.key === "ArrowDown"
                            ) {
                              ev.preventDefault();
                              const delta = ev.key === "ArrowUp" ? -15 : 15;
                              void mutate(
                                {
                                  ...e,
                                  start: e.start + delta,
                                  end: e.end + delta,
                                },
                                "PUT",
                                "move",
                              );
                            }
                          }}
                        >
                          <GripVertical size={17} />
                        </button>
                        <button
                          className="event-body"
                          disabled={busy}
                          onClick={() => setEditing({ ...e })}
                        >
                          <strong>{e.name}</strong>
                          <span>
                            {label(e.start)} – {label(e.end)} <i>·</i>{" "}
                            {duration(e.end - e.start)}
                          </span>
                        </button>
                        <div className="event-controls">
                          <button
                            className="icon"
                            title="Shorten by 15 minutes"
                            aria-label={`Shorten ${e.name} by 15 minutes`}
                            disabled={busy || e.end - e.start <= 15}
                            onClick={() =>
                              void mutate({ ...e, end: e.end - 15 })
                            }
                          >
                            <Minus size={15} />
                          </button>
                          <button
                            className="icon"
                            title="Extend by 15 minutes"
                            aria-label={`Extend ${e.name} by 15 minutes`}
                            disabled={busy || e.end >= 1440}
                            onClick={() =>
                              void mutate({ ...e, end: e.end + 15 })
                            }
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {schedule.events.length === 0 && (
                    <div className="empty-calendar">
                      <Plus size={26} />
                      <h3>Start with one thing.</h3>
                      <p>Add an event, or double-click a time on the grid.</p>
                      <button className="secondary" onClick={add}>
                        Add your first event
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="calendar-footer">
                <span>
                  <GripVertical size={15} /> Drag the left handle to make room.
                </span>
                <span>
                  <Minus size={13} />
                  <Plus size={13} /> Adjust in 15-minute steps.
                </span>
              </div>
            </section>
            <div className="bottom-note">
              <Leaf size={16} />
              <span>Leave some space for being human.</span>
              <span>One day at a time.</span>
            </div>
          </>
        )}
        <div
          className={`feedback ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          {error || notice}
        </div>
      </main>
      {auth && (
        <AuthDialog
          mode={auth}
          onClose={() => setAuth(null)}
          onSwitch={() => setAuth(auth === "login" ? "register" : "login")}
          onSubmit={async (email, password) => {
            const u = await api<{ email: string }>(
              auth === "login" ? "/login" : "/register",
              "POST",
              { email, password },
            );
            const s = await api<Schedule>("/events");
            setUser(u.email);
            setSchedule(s);
            setDemo(false);
            setAuth(null);
            setError("");
            setNotice("");
          }}
        />
      )}
      {editing && (
        <EventDialog
          event={editing}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setError("");
            }
          }}
          onSave={(e) => void mutate(e, e.id ? "PUT" : "POST")}
          onDelete={() => void mutate(editing, "DELETE")}
        />
      )}
    </div>
  );
}
function Modal({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    box.current?.querySelector<HTMLElement>("input,button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
          box.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
          ) || [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
function AuthDialog({
  mode,
  onClose,
  onSwitch,
  onSubmit,
}: {
  mode: "login" | "register";
  onClose: () => void;
  onSwitch: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      label={mode === "login" ? "Welcome back" : "Create your space"}
    >
      <button
        className="close icon"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <div className="eyebrow">YOUR DAY. YOUR PACE.</div>
      <h2>{mode === "login" ? "Welcome back." : "Make room for your day."}</h2>
      <p>
        {mode === "login"
          ? "Your everyday plan is waiting for you."
          : "A flexible routine starts with a little space."}
      </p>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={10}
            maxLength={72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <small>At least 10 characters.</small>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary wide" disabled={busy}>
          {busy ? <LoaderCircle size={17} className="spin" /> : null}
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <button className="text-button wide" disabled={busy} onClick={onSwitch}>
        {mode === "login"
          ? "New here? Create an account"
          : "Already have an account? Log in"}
      </button>
    </Modal>
  );
}
function EventDialog({
  event,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  event: Event;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (e: Event) => void;
  onDelete: () => void;
}) {
  const [e, setE] = useState({ ...event }),
    [confirmDelete, setConfirmDelete] = useState(false);
  const options = Array.from({ length: 97 }, (_, i) => i * 15);
  const valid = e.name.trim().length > 0 && e.end > e.start;
  return (
    <Modal onClose={onClose} label={e.id ? "Edit event" : "Add event"}>
      <button
        className="close icon"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <div className="eyebrow">A LITTLE ROOM TO MOVE</div>
      <h2>{e.id ? "Make it work for you." : "One thing on your day."}</h2>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) onSave({ ...e, name: e.name.trim() });
        }}
      >
        <label>
          Event name
          <input
            required
            maxLength={120}
            placeholder="What would you like to make time for?"
            value={e.name}
            onChange={(ev) => setE({ ...e, name: ev.target.value })}
          />
        </label>
        <div className="time-fields">
          <label>
            Starts
            <select
              value={e.start}
              onChange={(ev) => setE({ ...e, start: Number(ev.target.value) })}
            >
              {options
                .filter((t) => t < 1440)
                .map((t) => (
                  <option key={t} value={t}>
                    {time(t)}
                  </option>
                ))}
            </select>
          </label>
          <span>→</span>
          <label>
            Ends
            <select
              value={e.end}
              onChange={(ev) => setE({ ...e, end: Number(ev.target.value) })}
            >
              {options
                .filter((t) => t > 0)
                .map((t) => (
                  <option key={t} value={t}>
                    {t === 1440 ? "24:00 · end of day" : time(t)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="shift-note">
          <Clock3 size={18} />
          <span>
            {e.end > e.start
              ? `${duration(e.end - e.start)} of your day`
              : "End time must be after start time."}
            <small>
              <ArrowUp size={12} /> Earlier starts bump collisions up.
              <br />
              <ArrowDown size={12} /> Later ends push collisions down.
            </small>
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {e.id && (
            <button
              type="button"
              className="delete-button"
              disabled={busy}
              onClick={() => {
                if (confirmDelete) onDelete();
                else setConfirmDelete(true);
              }}
            >
              <Trash2 size={16} />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={!valid || busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {e.id ? "Save changes" : "Add event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
