package main

import (
	"log"
	"net/http"
)

func main() {
	port := "8000"
	log.Printf("Listening on http://localhost:%s/", port)
	http.Handle("/", http.FileServer(http.Dir(".")))
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
