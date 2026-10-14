export type Event = {
  id: string;
  name: string;
  start: number;
  end: number;
  locked?: boolean;
};
const noRoom = "No room for this event—shorten it or free some space.";
const overlap = (a: Event, b: Event) => a.start < b.end && b.start < a.end;
function fit(block: Event, locks: Event[], up: boolean): Event {
  const e = { ...block },
    duration = e.end - e.start;
  for (;;) {
    const conflict = locks.find((l) => overlap(e, l));
    if (!conflict) return e;
    if (up) {
      e.end = conflict.start;
      e.start = e.end - duration;
    } else {
      e.start = conflict.end;
      e.end = e.start + duration;
    }
    if (e.start < 0 || e.end > 1440) throw new Error(noRoom);
  }
}
export function resolve(events: Event[], selected: Event): Event[] {
  if (
    !selected.name.trim() ||
    selected.start < 0 ||
    selected.end > 1440 ||
    selected.end <= selected.start ||
    selected.start % 15 ||
    selected.end % 15
  )
    throw new Error("Use a name and 15-minute times within the day.");
  const old = events.find((e) => e.id === selected.id),
    locks = events.filter((e) => e.id !== selected.id && e.locked),
    rest = events
      .filter((e) => e.id !== selected.id && !e.locked)
      .sort((a, b) => a.start - b.start);
  if (old?.locked && (old.start !== selected.start || old.end !== selected.end))
    throw new Error("Unlock this event before changing its time.");
  const finish = (flexible: Event[], anchor: Event) => {
    const out = [...locks, ...flexible, anchor].sort(
      (a, b) => a.start - b.start,
    );
    if (
      out.some(
        (e, i) =>
          e.start < 0 || e.end > 1440 || (i > 0 && overlap(out[i - 1], e)),
      )
    )
      throw new Error(noRoom);
    return out;
  };
  if (old && old.start === selected.start && old.end === selected.end)
    return finish(rest, selected);
  if (!old || old.end - old.start === selected.end - selected.start) {
    for (const up of [false, true]) {
      try {
        const anchor = fit(selected, locks, up),
          flexible = rest.map((e) => ({ ...e }));
        let cursor = up ? anchor.start : anchor.end;
        for (const e of up ? [...flexible].reverse() : flexible) {
          if (up) {
            if (e.start >= anchor.end) continue;
            if (e.end <= cursor) {
              cursor = e.start;
              continue;
            }
            const d = e.end - e.start;
            e.end = cursor;
            e.start = cursor - d;
          } else {
            if (e.end <= anchor.start) continue;
            if (e.start >= cursor) {
              cursor = e.end;
              continue;
            }
            const d = e.end - e.start;
            e.start = cursor;
            e.end = cursor + d;
          }
          Object.assign(e, fit(e, locks, up));
          cursor = up ? e.start : e.end;
        }
        return finish(flexible, anchor);
      } catch {
        /* Try the other direction using the original schedule. */
      }
    }
    throw new Error(noRoom);
  }
  if (locks.some((l) => overlap(selected, l)))
    throw new Error(
      "This resize crosses a locked event. Move the event or unlock the appointment first.",
    );
  const flexible = rest.map((e) => ({ ...e }));
  let cursor = selected.start;
  for (const e of [...flexible].reverse()) {
    if (e.end > old.start) continue;
    if (e.end > cursor) {
      const d = e.end - e.start;
      e.end = cursor;
      e.start = cursor - d;
      Object.assign(e, fit(e, locks, true));
    }
    cursor = e.start;
  }
  cursor = selected.end;
  for (const e of flexible) {
    if (e.start < old.end) continue;
    if (e.start < cursor) {
      const d = e.end - e.start;
      e.start = cursor;
      e.end = cursor + d;
      Object.assign(e, fit(e, locks, false));
    }
    cursor = e.end;
  }
  return finish(flexible, selected);
}
export function preview(events: Event[], selected: Event): Event[] | null {
  try {
    return resolve(events, selected);
  } catch {
    return null;
  }
}
