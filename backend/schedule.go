package main

import (
	"errors"
	"sort"
	"strings"
)

type Event struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}
type Schedule struct {
	Events  []Event `json:"events"`
	Version int64   `json:"version"`
}

func validEvent(e Event) bool {
	return strings.TrimSpace(e.Name) != "" && len([]rune(e.Name)) <= 120 && e.Start >= 0 && e.End <= 1440 && e.End > e.Start && e.Start%15 == 0 && e.End%15 == 0
}

// Anchor the edited event. Preserve the order and duration of every other event;
// move a collision only as far as needed, stopping at existing gaps.
func arrange(events []Event, selected Event, upward bool) ([]Event, error) {
	rest := make([]Event, 0, len(events))
	for _, e := range events {
		if e.ID != selected.ID {
			rest = append(rest, e)
		}
	}
	sort.Slice(rest, func(i, j int) bool { return rest[i].Start < rest[j].Start })
	if upward {
		cursor := selected.Start
		for i := len(rest) - 1; i >= 0; i-- {
			e := &rest[i]
			if e.Start >= selected.End {
				continue
			}
			if e.End > cursor {
				duration := e.End - e.Start
				e.End = cursor
				e.Start = cursor - duration
			}
			cursor = e.Start
		}
	} else {
		cursor := selected.End
		for i := range rest {
			e := &rest[i]
			if e.End <= selected.Start {
				continue
			}
			if e.Start < cursor {
				duration := e.End - e.Start
				e.Start = cursor
				e.End = cursor + duration
			}
			cursor = e.End
		}
	}
	for _, e := range rest {
		if e.Start < 0 || e.End > 1440 {
			return nil, errors.New("There isn’t enough room in this day. Shorten an event or choose another time.")
		}
	}
	rest = append(rest, selected)
	sort.Slice(rest, func(i, j int) bool { return rest[i].Start < rest[j].Start })
	return rest, nil
}
