package handlers

import (
	"net/http"
	"orbitbooth/models"
	"sort"
	"sync"

	"time"

	"github.com/gin-gonic/gin"
)

var (
	// In-memory mock store
	mockScores = []models.Score{
		{PlayerName: "Alice", ScoreValue: 1500, GameName: "rocket_jump", Timestamp: time.Now()},
		{PlayerName: "Bob", ScoreValue: 1200, GameName: "rocket_jump", Timestamp: time.Now()},
		{PlayerName: "Charlie", ScoreValue: 900, GameName: "rocket_jump", Timestamp: time.Now()},
	}
	mu sync.Mutex
)

// GetLeaderboard handles GET /games1/api/leaderboard
func GetLeaderboard(c *gin.Context) {
	gameName := c.Query("gameName")
	
	mu.Lock()
	defer mu.Unlock()

	// Filter scores by gameName if provided
	var filteredScores []models.Score
	for _, s := range mockScores {
		if gameName == "" || s.GameName == gameName {
			filteredScores = append(filteredScores, s)
		}
	}

	// Sort scores descending by value, then descending by timestamp (most recent first)
	sort.Slice(filteredScores, func(i, j int) bool {
		if filteredScores[i].ScoreValue == filteredScores[j].ScoreValue {
			return filteredScores[i].Timestamp.After(filteredScores[j].Timestamp)
		}
		return filteredScores[i].ScoreValue > filteredScores[j].ScoreValue
	})

	// Return top 10
	limit := 10
	if len(filteredScores) < 10 {
		limit = len(filteredScores)
	}

	c.JSON(http.StatusOK, gin.H{
		"leaderboard": filteredScores[:limit],
	})
}

// SubmitScore handles POST /games1/api/score
func SubmitScore(c *gin.Context) {
	var newScore models.Score
	if err := c.ShouldBindJSON(&newScore); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if newScore.PlayerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PlayerName is required"})
		return
	}
	
	if newScore.GameName == "" {
		newScore.GameName = "rocket_jump" // Default for backwards compatibility
	}
	
	newScore.Timestamp = time.Now()

	mu.Lock()
	mockScores = append(mockScores, newScore)
	mu.Unlock()

	c.JSON(http.StatusCreated, gin.H{
		"message": "Score submitted successfully",
		"score":   newScore,
	})
}
