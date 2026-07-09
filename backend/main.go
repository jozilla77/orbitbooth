package main

import (
	"log"
	"os"

	"orbitbooth/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Set Gin to release mode in production
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Configure CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // Adjust in production to specific domain
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Define API routes first
	api := r.Group("/api")
	{
		api.GET("/leaderboard", handlers.GetLeaderboard)
		api.POST("/score", handlers.SubmitScore)
	}

	// Serve the Flutter web app files using static file server on NoRoute to avoid conflict
	r.NoRoute(func(c *gin.Context) {
		// Try to serve the file from the public directory
		path := c.Request.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		
		filePath := "./public" + path
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			// Fallback to index.html for SPA routing
			c.File("./public/index.html")
			return
		}
		c.File(filePath)
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
		log.Printf("Defaulting to port %s", port)
	}

	log.Printf("Listening on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
