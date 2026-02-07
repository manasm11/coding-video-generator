.PHONY: generate build run dev clean

# Generate templ templates
generate:
	templ generate

# Build the Go binary
build: generate
	go build -o bin/server ./cmd/server

# Run the server
run: build
	./bin/server

# Development: generate templates then run with auto-reload
dev: generate
	go run ./cmd/server

# Clean build artifacts
clean:
	rm -rf bin/
	find templates -name '*_templ.go' -delete 2>/dev/null || true
