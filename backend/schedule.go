package main

import (
	"errors"
	"sort"
	"strings"
)

type Event struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Start  int    `json:"start"`
	End    int    `json:"end"`
	Locked bool   `json:"locked"`
}
type Schedule struct {
	Events  []Event `json:"events"`
	Version int64   `json:"version"`
}

var noRoom = errors.New("No room for this event—shorten it or free some space.")

func validEvent(e Event) bool {
	return strings.TrimSpace(e.Name) != "" && len([]rune(e.Name)) <= 120 && e.Start >= 0 && e.End <= 1440 && e.End > e.Start && e.Start%15 == 0 && e.End%15 == 0
}
func overlap(a, b Event) bool { return a.Start < b.End && b.Start < a.End }

// Fit an intact block around immutable obstacles in the chosen direction.
func fit(e Event, locks []Event, up bool) (Event, error) {
	duration := e.End - e.Start
	for {
		changed := false
		for _, l := range locks {
			if overlap(e, l) {
				if up {
					e.End = l.Start
					e.Start = e.End - duration
				} else {
					e.Start = l.End
					e.End = e.Start + duration
				}
				changed = true
				break
			}
		}
		if e.Start < 0 || e.End > 1440 {
			return e, noRoom
		}
		if !changed {
			return e, nil
		}
	}
}
func resolve(events []Event, selected Event) ([]Event, error) {
	if !validEvent(selected) {
		return nil, errors.New("Use a name and 15-minute times within the day.")
	}
	var old *Event
	locks := []Event{}
	rest := []Event{}
	for _, e := range events {
		if e.ID == selected.ID {
			copy := e
			old = &copy
		} else if e.Locked {
			locks = append(locks, e)
		} else {
			rest = append(rest, e)
		}
	}
	sort.Slice(rest, func(i, j int) bool { return rest[i].Start < rest[j].Start })
	if old != nil && old.Locked && (old.Start != selected.Start || old.End != selected.End) {
		return nil, errors.New("Unlock this event before changing its time.")
	}
	finish := func(flexible []Event, anchor Event) ([]Event, error) {
		out := append(append([]Event{}, locks...), flexible...)
		out = append(out, anchor)
		sort.Slice(out, func(i, j int) bool { return out[i].Start < out[j].Start })
		for i, e := range out {
			if !validEvent(e) {
				return nil, noRoom
			}
			if i > 0 && overlap(out[i-1], e) {
				return nil, noRoom
			}
		}
		return out, nil
	}
	if old != nil && old.Start == selected.Start && old.End == selected.End {
		return finish(rest, selected)
	}
	move := old == nil || old.End-old.Start == selected.End-selected.Start
	// A move first tries later placement and cascades, then earlier placement.
	if move {
		for _, up := range []bool{false, true} {
			anchor, err := fit(selected, locks, up)
			if err != nil {
				continue
			}
			flexible := append([]Event{}, rest...)
			cursor := anchor.End
			if up {
				cursor = anchor.Start
			}
			for step := 0; step < len(flexible); step++ {
				i := step
				if up {
					i = len(flexible) - 1 - step
				}
				e := &flexible[i]
				if up {
					if e.Start >= anchor.End {
						continue
					}
					if e.End <= cursor {
						cursor = e.Start
						continue
					}
					d := e.End - e.Start
					e.End = cursor
					e.Start = cursor - d
				} else {
					if e.End <= anchor.Start {
						continue
					}
					if e.Start >= cursor {
						cursor = e.End
						continue
					}
					d := e.End - e.Start
					e.Start = cursor
					e.End = cursor + d
				}
				fitted, fitErr := fit(*e, locks, up)
				if fitErr != nil {
					err = fitErr
					break
				}
				*e = fitted
				if up {
					cursor = e.Start
				} else {
					cursor = e.End
				}
			}
			if err == nil {
				if result, finishErr := finish(flexible, anchor); finishErr == nil {
					return result, nil
				}
			}
		}
		return nil, noRoom
	}
	// Resizes anchor exact bounds and independently cascade on both sides.
	for _, l := range locks {
		if overlap(selected, l) {
			return nil, errors.New("This resize crosses a locked event. Move the event or unlock the appointment first.")
		}
	}
	flexible := append([]Event{}, rest...)
	cursor := selected.Start
	for i := len(flexible) - 1; i >= 0; i-- {
		e := &flexible[i]
		if e.End > old.Start {
			continue
		}
		if e.End > cursor {
			d := e.End - e.Start
			e.End = cursor
			e.Start = cursor - d
			fitted, err := fit(*e, locks, true)
			if err != nil {
				return nil, err
			}
			*e = fitted
		}
		cursor = e.Start
	}
	cursor = selected.End
	for i := range flexible {
		e := &flexible[i]
		if e.Start < old.End {
			continue
		}
		if e.Start < cursor {
			d := e.End - e.Start
			e.Start = cursor
			e.End = cursor + d
			fitted, err := fit(*e, locks, false)
			if err != nil {
				return nil, err
			}
			*e = fitted
		}
		cursor = e.End
	}
	return finish(flexible, selected)
}
