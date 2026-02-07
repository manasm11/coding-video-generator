package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/progress"

	"github.com/bytectlgo/edge-tts/pkg/edge_tts"
)

// voiceSpeedToRate converts a speed multiplier (e.g., 1.2) to edge-tts rate string (e.g., "+20%").
func voiceSpeedToRate(speed float64) string {
	if speed > 1 {
		return fmt.Sprintf("+%d%%", int(math.Round((speed-1)*100)))
	} else if speed < 1 {
		return fmt.Sprintf("-%d%%", int(math.Round((1-speed)*100)))
	}
	return "+0%"
}

// GenerateAudio generates a single MP3 from text using the edge-tts Go library.
func GenerateAudio(ctx context.Context, text, outputPath string, voiceSpeed float64) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create audio dir: %w", err)
	}

	rate := voiceSpeedToRate(voiceSpeed)

	comm := edge_tts.NewCommunicate(text, config.TTSVoice, edge_tts.WithRate(rate))
	if err := comm.Save(ctx, outputPath, ""); err != nil {
		return fmt.Errorf("edge-tts failed: %w", err)
	}

	return nil
}

// GenerateAllAudio generates audio files for all step explanations.
func GenerateAllAudio(
	ctx context.Context,
	explanations []string,
	jobID string,
	voiceSpeed float64,
	tracker *progress.Tracker,
) ([]string, error) {
	if err := os.MkdirAll(config.AudioDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create audio dir: %w", err)
	}

	totalSteps := len(explanations)
	var audioPaths []string

	for i, explanation := range explanations {
		stepNum := i + 1
		percent := float64(i) / float64(totalSteps) * 100

		if tracker != nil {
			tracker.UpdateProgress(percent,
				fmt.Sprintf("Generating audio for step %d/%d", stepNum, totalSteps),
				&stepNum)
		}

		outputPath := filepath.Join(config.AudioDir, fmt.Sprintf("%s_step_%d.mp3", jobID, i))

		stepCtx, cancel := context.WithTimeout(ctx, config.AudioPerStepTimeout)
		err := GenerateAudio(stepCtx, explanation, outputPath, voiceSpeed)
		cancel()
		if err != nil {
			return nil, fmt.Errorf("audio generation for step %d: %w", stepNum, err)
		}

		audioPaths = append(audioPaths, outputPath)
	}

	if tracker != nil {
		tracker.UpdateProgress(100, "Audio generation complete", &totalSteps)
	}

	return audioPaths, nil
}

// GetAudioDuration returns the duration of an MP3 file in seconds.
// Uses ffprobe for accurate measurement, with a file-size fallback.
func GetAudioDuration(audioPath string) float64 {
	duration := ffprobeDuration(audioPath)
	if duration > 0 {
		return duration + 0.5 // Add 0.5s buffer
	}

	// Fallback: estimate from file size at 128kbps
	stat, err := os.Stat(audioPath)
	if err != nil {
		return 10.0
	}
	estimated := float64(stat.Size())/(16*1024) + 0.5
	if estimated < 5.0 {
		return 5.0
	}
	return estimated
}

// ffprobeDuration uses ffprobe to get the exact duration of an audio file.
func ffprobeDuration(audioPath string) float64 {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "quiet",
		"-show_entries", "format=duration",
		"-of", "csv=p=0",
		audioPath,
	)
	output, err := cmd.Output()
	if err != nil {
		return 0
	}
	duration, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return 0
	}
	return duration
}

// CleanupAudio removes audio files for a job.
func CleanupAudio(jobID string) {
	pattern := filepath.Join(config.AudioDir, jobID+"_*")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return
	}
	for _, f := range matches {
		os.Remove(f)
	}
}
