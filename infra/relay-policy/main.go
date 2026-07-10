package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

type Event struct {
	ID        string     `json:"id"`
	Pubkey    string     `json:"pubkey"`
	Kind      int        `json:"kind"`
	CreatedAt int64      `json:"created_at"`
	Content   string     `json:"content"`
	Tags      [][]string `json:"tags"`
}

type Request struct {
	Type       string `json:"type"`
	Event      Event  `json:"event"`
	SourceType string `json:"sourceType"`
	SourceInfo string `json:"sourceInfo"`
}

type Response struct {
	ID     string `json:"id"`
	Action string `json:"action"`
	Msg    string `json:"msg,omitempty"`
}

type bucket struct {
	count   int
	resetAt time.Time
}

var (
	mu           sync.Mutex
	buckets      = map[string]bucket{}
	lastCleanup  time.Time
	diskChecked  time.Time
	diskWritable = true
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 64*1024), 256*1024)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	for scanner.Scan() {
		var req Request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			continue
		}
		response := evaluate(req)
		data, _ := json.Marshal(response)
		fmt.Fprintln(writer, string(data))
		writer.Flush()
	}
}

func evaluate(req Request) Response {
	reject := func(msg string) Response { return Response{ID: req.Event.ID, Action: "reject", Msg: msg} }
	if req.Type != "new" {
		return reject("unsupported request")
	}
	if blocked(req.Event.Pubkey) {
		return reject("blocked: pubkey")
	}
	if !hasDiskCapacity() {
		return reject("blocked: relay storage reserve reached")
	}
	if !allowedKind(req.Event.Kind) {
		return reject("blocked: unsupported event kind")
	}
	if req.Event.CreatedAt > time.Now().Add(10*time.Minute).Unix() {
		return reject("blocked: event timestamp too far in the future")
	}
	if len(req.Event.Tags) > 64 {
		return reject("blocked: too many tags")
	}
	for _, tag := range req.Event.Tags {
		for _, value := range tag {
			if len(value) > 1024 {
				return reject("blocked: tag too long")
			}
		}
	}
	if msg := validateContent(req.Event); msg != "" {
		return reject(msg)
	}
	if req.SourceType == "IP4" || req.SourceType == "IP6" {
		if !allow("ip:"+req.SourceInfo, 120, time.Minute) {
			return reject("rate-limited: ip")
		}
		if !allow("pubkey:"+req.Event.Pubkey, 60, time.Minute) {
			return reject("rate-limited: pubkey")
		}
	}
	return Response{ID: req.Event.ID, Action: "accept"}
}

func hasDiskCapacity() bool {
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	if now.Sub(diskChecked) < 5*time.Second {
		return diskWritable
	}
	path := os.Getenv("RELAY_DB_PATH")
	if path == "" {
		path = "/var/lib/anarchos/strfry-db"
	}
	minFreeBytes := uint64(1024 * 1024 * 1024)
	if configured := os.Getenv("RELAY_MIN_FREE_BYTES"); configured != "" {
		if parsed, err := strconv.ParseUint(configured, 10, 64); err == nil {
			minFreeBytes = parsed
		}
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		diskWritable = false
	} else {
		diskWritable = stat.Bavail*uint64(stat.Bsize) >= minFreeBytes
	}
	diskChecked = now
	return diskWritable
}

func allowedKind(kind int) bool {
	switch kind {
	case 0, 1, 5, 7, 1111, 30078:
		return true
	default:
		return false
	}
}

func validateContent(event Event) string {
	switch event.Kind {
	case 0:
		var profile map[string]json.RawMessage
		if len(event.Tags) != 0 || len(event.Content) > 4096 || json.Unmarshal([]byte(event.Content), &profile) != nil {
			return "blocked: invalid profile"
		}
		for _, field := range []string{"name", "display_name"} {
			rawName, exists := profile[field]
			if !exists {
				continue
			}
			var name string
			if json.Unmarshal(rawName, &name) != nil || utf8.RuneCountInString(name) > 40 {
				return "blocked: invalid profile"
			}
		}
	case 30078:
		var setting map[string]json.RawMessage
		if len(event.Tags) != 1 || len(event.Tags[0]) != 2 || tagValue(event.Tags, "d") != "anarchos:fixed-nickname" || len(event.Content) > 64 || json.Unmarshal([]byte(event.Content), &setting) != nil || len(setting) != 1 {
			return "blocked: invalid fixed nickname setting"
		}
		var enabled bool
		rawEnabled, exists := setting["enabled"]
		if !exists || json.Unmarshal(rawEnabled, &enabled) != nil {
			return "blocked: invalid fixed nickname setting"
		}
	case 1:
		title := tagValue(event.Tags, "subject")
		if utf8.RuneCountInString(title) == 0 || utf8.RuneCountInString(title) > 100 || utf8.RuneCountInString(event.Content) > 10000 {
			return "blocked: invalid post length"
		}
	case 1111:
		if len(strings.TrimSpace(event.Content)) == 0 || utf8.RuneCountInString(event.Content) > 2000 {
			return "blocked: invalid comment length"
		}
		if tagValue(event.Tags, "E") == "" || tagValue(event.Tags, "e") == "" {
			return "blocked: invalid comment tags"
		}
	case 7:
		if event.Content != "+" || tagValue(event.Tags, "e") == "" {
			return "blocked: invalid reaction"
		}
	case 5:
		if tagValue(event.Tags, "e") == "" {
			return "blocked: invalid deletion"
		}
	}
	return ""
}

func tagValue(tags [][]string, name string) string {
	for _, tag := range tags {
		if len(tag) > 1 && tag[0] == name {
			return tag[1]
		}
	}
	return ""
}

func allow(key string, limit int, window time.Duration) bool {
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	if now.Sub(lastCleanup) > time.Minute {
		for bucketKey, candidate := range buckets {
			if now.After(candidate.resetAt) {
				delete(buckets, bucketKey)
			}
		}
		lastCleanup = now
	}
	current, exists := buckets[key]
	if !exists || now.After(current.resetAt) {
		buckets[key] = bucket{count: 1, resetAt: now.Add(window)}
		return true
	}
	if current.count >= limit {
		return false
	}
	current.count++
	buckets[key] = current
	return true
}

func blocked(pubkey string) bool {
	path := os.Getenv("BLOCKED_PUBKEY_FILE")
	if path == "" {
		path = "/var/lib/anarchos/blocked-pubkeys.txt"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) == pubkey {
			return true
		}
	}
	return false
}
