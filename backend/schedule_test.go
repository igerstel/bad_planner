package main

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestScheduleDecisions(t *testing.T) {
	data, err := os.ReadFile("testdata/schedule.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string
		Events []Event
		Edited Event
		Want   map[string][2]int
		Error  bool
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			before := append([]Event{}, tc.Events...)
			got, err := resolve(tc.Events, tc.Edited)
			if !reflect.DeepEqual(before, tc.Events) {
				t.Fatal("resolver mutated source schedule")
			}
			if tc.Error {
				if err == nil {
					t.Fatal("expected rejected edit")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != len(tc.Want) {
				t.Fatalf("events lost or added: %v", got)
			}
			for i, e := range got {
				if [2]int{e.Start, e.End} != tc.Want[e.ID] {
					t.Errorf("%s: got %d-%d want %v", e.ID, e.Start, e.End, tc.Want[e.ID])
				}
				if i > 0 && overlap(got[i-1], e) {
					t.Fatal("overlap")
				}
				for _, old := range tc.Events {
					if old.ID == e.ID && old.ID != tc.Edited.ID {
						if old.End-old.Start != e.End-e.Start {
							t.Fatal("duration changed")
						}
						if old.Locked && old != e {
							t.Fatal("locked event changed")
						}
					}
				}
			}
		})
	}
}
