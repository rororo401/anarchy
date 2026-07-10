package main

import (
	"testing"
	"time"
)

func TestEvaluate(t *testing.T) {
	t.Setenv("RELAY_DB_PATH", t.TempDir())
	t.Setenv("RELAY_MIN_FREE_BYTES", "0")

	assertAction(t, evaluate(request("ok", "pubkey", 1, "본문", [][]string{{"subject", "제목"}})), "accept")
	assertAction(t, evaluate(request("profile", "profile-pubkey", 0, `{"name":"닉네임"}`, nil)), "accept")
	assertAction(t, evaluate(request("extended-profile", "profile-pubkey", 0, `{"name":"닉네임","about":"소개"}`, nil)), "accept")
	assertAction(t, evaluate(request("bad-profile", "profile-pubkey", 0, `{"name":123}`, nil)), "reject")
	assertAction(t, evaluate(request("fixed-nickname", "profile-pubkey", 30078, `{"enabled":true}`, [][]string{{"d", "anarchos:fixed-nickname"}})), "accept")
	assertAction(t, evaluate(request("bad-fixed-nickname", "profile-pubkey", 30078, `{"enabled":"yes"}`, [][]string{{"d", "anarchos:fixed-nickname"}})), "reject")
	assertAction(t, evaluate(request("bad-kind", "pubkey", 2, "x", nil)), "reject")
	assertAction(t, evaluate(request("bad-comment", "pubkey", 1111, "댓글", nil)), "reject")
}

func TestRateLimit(t *testing.T) {
	t.Setenv("RELAY_DB_PATH", t.TempDir())
	t.Setenv("RELAY_MIN_FREE_BYTES", "0")
	buckets = map[string]bucket{}

	for i := 0; i < 60; i++ {
		assertAction(t, evaluate(request("rate", "rate-pubkey", 1, "body", [][]string{{"subject", "title"}})), "accept")
	}
	assertAction(t, evaluate(request("rate", "rate-pubkey", 1, "body", [][]string{{"subject", "title"}})), "reject")
}

func TestStorageReserveFailsClosed(t *testing.T) {
	t.Setenv("RELAY_DB_PATH", "/path/that/does/not/exist")
	t.Setenv("RELAY_MIN_FREE_BYTES", "0")
	diskChecked = diskChecked.Add(-10 * time.Second)
	assertAction(t, evaluate(request("disk", "pubkey", 1, "body", [][]string{{"subject", "title"}})), "reject")
}

func request(id string, pubkey string, kind int, content string, tags [][]string) Request {
	return Request{
		Type: "new", Event: Event{ID: id, Pubkey: pubkey, Kind: kind, CreatedAt: time.Now().Unix(), Content: content, Tags: tags},
		SourceType: "IP4", SourceInfo: "127.0.0.1",
	}
}

func assertAction(t *testing.T, response Response, action string) {
	t.Helper()
	if response.Action != action {
		t.Fatalf("expected %s, got %#v", action, response)
	}
}
