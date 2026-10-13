package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/mail"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed schema.sql
var schema embed.FS

type app struct {
	db     *pgxpool.Pool
	origin string
	secure bool
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("Use application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("Expected one JSON object")
	}
	return nil
}
func digest(token string) string { h := sha256.Sum256([]byte(token)); return hex.EncodeToString(h[:]) }
func (a *app) user(r *http.Request) (string, error) {
	c, err := r.Cookie("planner_session")
	if err != nil {
		return "", err
	}
	var id string
	err = a.db.QueryRow(r.Context(), "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()", digest(c.Value)).Scan(&id)
	return id, err
}
func (a *app) cookie(w http.ResponseWriter, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: "planner_session", Value: value, Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (a *app) auth(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if decode(w, r, &input) != nil {
		fail(w, 400, "Enter an email and password.")
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	address, err := mail.ParseAddress(input.Email)
	if err != nil || address.Address != input.Email || len(input.Email) > 254 || len(input.Password) < 10 || len(input.Password) > 72 {
		fail(w, 400, "Use a valid email and a password of 10–72 bytes.")
		return
	}
	var id, hash string
	if r.URL.Path == "/api/register" {
		encrypted, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			fail(w, 500, "Could not create account.")
			return
		}
		err = a.db.QueryRow(r.Context(), "INSERT INTO users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING RETURNING id", input.Email, string(encrypted)).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 409, "An account with this email already exists.")
			return
		}
		if err != nil {
			log.Print(err)
			fail(w, 500, "Could not create account.")
			return
		}
	} else {
		err = a.db.QueryRow(r.Context(), "SELECT id,password_hash FROM users WHERE email=$1", input.Email).Scan(&id, &hash)
		// Always run bcrypt so absent accounts do not take a fast path.
		if err != nil {
			hash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
		}
		check := bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password))
		if err != nil || check != nil {
			fail(w, 401, "Email or password is incorrect.")
			return
		}
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		fail(w, 500, "Could not sign in.")
		return
	}
	token := hex.EncodeToString(b)
	if _, err = a.db.Exec(r.Context(), "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", digest(token), id); err != nil {
		fail(w, 500, "Could not sign in.")
		return
	}
	a.cookie(w, token, 30*24*3600)
	reply(w, 200, map[string]string{"email": input.Email})
}
func loadEvents(ctx context.Context, tx pgx.Tx, id string) ([]Event, error) {
	rows, err := tx.Query(ctx, "SELECT id,name,start_minute,end_minute FROM events WHERE user_id=$1 ORDER BY start_minute", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Event{}
	for rows.Next() {
		var e Event
		if err = rows.Scan(&e.ID, &e.Name, &e.Start, &e.End); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
func (a *app) events(w http.ResponseWriter, r *http.Request) {
	id, err := a.user(r)
	if err != nil {
		fail(w, 401, "Please sign in.")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		fail(w, 503, "Database unavailable.")
		return
	}
	defer tx.Rollback(ctx)
	// A user-row lock serializes edits and makes versions and cascades atomic.
	var version int64
	if err = tx.QueryRow(ctx, "SELECT schedule_version FROM users WHERE id=$1 FOR UPDATE", id).Scan(&version); err != nil {
		fail(w, 500, "Could not load schedule.")
		return
	}
	events, err := loadEvents(ctx, tx, id)
	if err != nil {
		fail(w, 500, "Could not load events.")
		return
	}
	if r.Method == "GET" {
		reply(w, 200, Schedule{events, version})
		return
	}
	expected, err := strconv.ParseInt(r.Header.Get("If-Match"), 10, 64)
	if err != nil || expected != version {
		fail(w, 409, "Your schedule changed in another window. The latest version has been loaded; please try again.")
		return
	}
	eventID := r.PathValue("id")
	if r.Method == "DELETE" {
		found := false
		for _, e := range events {
			if e.ID == eventID {
				found = true
			}
		}
		if !found {
			fail(w, 404, "Event not found.")
			return
		}
		_, err = tx.Exec(ctx, "DELETE FROM events WHERE id=$1 AND user_id=$2", eventID, id)
	} else {
		var edited Event
		if decode(w, r, &edited) != nil || !validEvent(edited) {
			fail(w, 400, "Use a name and 15-minute times within the day.")
			return
		}
		edited.Name = strings.TrimSpace(edited.Name)
		upward := false
		found := false
		if r.Method == "PUT" {
			edited.ID = eventID
			for _, e := range events {
				if e.ID == eventID {
					found = true
					upward = edited.Start < e.Start && edited.End == e.End
				}
			}
			if !found {
				fail(w, 404, "Event not found.")
				return
			}
		} else {
			err = tx.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&edited.ID)
			if err != nil {
				fail(w, 500, "Could not create event.")
				return
			}
		}
		resolved, resolveErr := arrange(events, edited, upward)
		// Dragging prefers downward shifts; fall back upward when the bottom is full.
		if resolveErr != nil && !upward && r.Header.Get("X-Edit-Intent") == "move" {
			resolved, resolveErr = arrange(events, edited, true)
		}
		if resolveErr != nil {
			fail(w, 422, resolveErr.Error())
			return
		}
		for _, e := range resolved {
			_, err = tx.Exec(ctx, `INSERT INTO events(id,user_id,name,start_minute,end_minute) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,start_minute=EXCLUDED.start_minute,end_minute=EXCLUDED.end_minute WHERE events.user_id=EXCLUDED.user_id`, e.ID, id, e.Name, e.Start, e.End)
			if err != nil {
				break
			}
		}
	}
	if err == nil {
		_, err = tx.Exec(ctx, "UPDATE users SET schedule_version=schedule_version+1 WHERE id=$1", id)
	}
	if err != nil {
		log.Print(err)
		fail(w, 500, "Could not save. Your schedule has not changed.")
		return
	}
	events, err = loadEvents(ctx, tx, id)
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		log.Print(err)
		fail(w, 500, "Could not save. Reload your schedule before retrying.")
		return
	}
	reply(w, 200, Schedule{events, version + 1})
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://localhost/planner_dev?sslmode=disable"
	}
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	migration, _ := schema.ReadFile("schema.sql")
	if _, err = db.Exec(ctx, string(migration)); err != nil {
		log.Fatal(err)
	}
	origin := os.Getenv("APP_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	a := &app{db: db, origin: origin, secure: strings.HasPrefix(origin, "https://")}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/register", a.auth)
	mux.HandleFunc("POST /api/login", a.auth)
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		id, err := a.user(r)
		if err != nil {
			fail(w, 401, "Please sign in.")
			return
		}
		var email string
		if err = a.db.QueryRow(r.Context(), "SELECT email FROM users WHERE id=$1", id).Scan(&email); err != nil {
			fail(w, 500, "Could not load account.")
			return
		}
		reply(w, 200, map[string]string{"email": email})
	})
	mux.HandleFunc("POST /api/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie("planner_session"); err == nil {
			if _, err = a.db.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", digest(c.Value)); err != nil {
				fail(w, 503, "Could not sign out. Try again.")
				return
			}
		}
		a.cookie(w, "", -1)
		reply(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/events", a.events)
	mux.HandleFunc("POST /api/events", a.events)
	mux.HandleFunc("PUT /api/events/{id}", a.events)
	mux.HandleFunc("DELETE /api/events/{id}", a.events)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			fail(w, 503, "Database unavailable.")
			return
		}
		reply(w, 200, map[string]string{"status": "ok"})
	})
	mux.Handle("/", http.FileServer(http.Dir("../web/dist")))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Origin") != a.origin {
			fail(w, 403, "Request origin is not allowed.")
			return
		}
		mux.ServeHTTP(w, r)
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	// HTTP already serves requests concurrently; this goroutine owns graceful shutdown.
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanup, cancel := context.WithTimeout(ctx, 10*time.Second)
				_, err := db.Exec(cleanup, "DELETE FROM sessions WHERE expires_at<=now()")
				cancel()
				if err != nil {
					log.Print(err)
				}
			}
		}
	}()
	fmt.Printf("bad_planner listening on http://localhost:%s\n", port)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
