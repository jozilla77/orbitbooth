package models

import "time"

// Score represents a user's high score
type Score struct {
	PlayerName string    `json:"playerName"`
	ScoreValue int       `json:"score"`
	GameName   string    `json:"gameName"`
	Timestamp  time.Time `json:"timestamp"`
}
