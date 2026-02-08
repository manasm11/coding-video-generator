package config

import (
	"path/filepath"
	"time"
)

// Timeout settings
const (
	ContentGenerationTimeout = 5 * time.Minute
	AudioPerStepTimeout      = 1 * time.Minute
	RemotionBundleTimeout    = 3 * time.Minute
	VideoRenderTimeout       = 10 * time.Minute
)

// SSE settings
const (
	MaxBufferLines            = 500
	CleanupGracePeriod        = 5 * time.Minute
	SSEKeepaliveInterval      = 30 * time.Second
	SubscriberQueueSize       = 100
)

// Progress tracking
const MaxLogs = 50

// Content generation limits
const MaxLinesPerStep = 25

// TTS settings
const TTSVoice = "en-US-GuyNeural"

// Server settings
const ServerPort = ":8001"

// Path settings
var (
	ProjectRoot = "."
	OutputDir   = filepath.Join("output")
	AudioDir    = filepath.Join("output", "audio")
	RemotionDir = filepath.Join("server", "remotion")
)
