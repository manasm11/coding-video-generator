package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/progress"
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

// GenerateAudio generates a single MP3 from text using edge-tts CLI.
func GenerateAudio(ctx context.Context, text, outputPath string, voiceSpeed float64) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create audio dir: %w", err)
	}

	rate := voiceSpeedToRate(voiceSpeed)

	cmd := exec.CommandContext(ctx, "edge-tts",
		"--voice", config.TTSVoice,
		"--rate", rate,
		"--text", text,
		"--write-media", outputPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("edge-tts failed: %w: %s", err, string(output))
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
// Uses a simple frame-counting approach.
func GetAudioDuration(audioPath string) float64 {
	f, err := os.Open(audioPath)
	if err != nil {
		return 10.0
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return 10.0
	}

	// Parse MP3 frames to get duration
	duration := parseMP3Duration(f, stat.Size())
	if duration > 0 {
		return duration + 0.5 // Add 0.5s buffer
	}

	// Fallback: estimate from file size at 128kbps
	estimated := float64(stat.Size()) / (16 * 1024)
	if estimated < 5.0 {
		return 5.0
	}
	return estimated
}

// parseMP3Duration attempts to calculate MP3 duration by reading frame headers.
func parseMP3Duration(f *os.File, fileSize int64) float64 {
	buf := make([]byte, 4)
	offset := int64(0)

	// Skip ID3v2 tag if present
	header := make([]byte, 10)
	if _, err := f.ReadAt(header, 0); err == nil {
		if string(header[:3]) == "ID3" {
			tagSize := int64(header[6])<<21 | int64(header[7])<<14 | int64(header[8])<<7 | int64(header[9])
			offset = tagSize + 10
		}
	}

	// MPEG audio bitrate table for MPEG1 Layer 3
	bitrateTable := []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0}
	sampleRateTable := []int{44100, 48000, 32000, 0}

	totalSamples := 0
	sampleRate := 0
	framesRead := 0

	for offset < fileSize-4 {
		if _, err := f.ReadAt(buf, offset); err != nil {
			break
		}

		// Check for frame sync (11 bits set)
		if buf[0] != 0xFF || (buf[1]&0xE0) != 0xE0 {
			offset++
			continue
		}

		// Parse header
		bitrateIndex := int(buf[2]>>4) & 0x0F
		sampleRateIndex := int(buf[2]>>2) & 0x03
		padding := int(buf[2]>>1) & 0x01

		if bitrateIndex == 0 || bitrateIndex == 15 || sampleRateIndex == 3 {
			offset++
			continue
		}

		bitrate := bitrateTable[bitrateIndex] * 1000
		sampleRate = sampleRateTable[sampleRateIndex]

		if bitrate == 0 || sampleRate == 0 {
			offset++
			continue
		}

		frameSize := (144*bitrate)/sampleRate + padding
		if frameSize <= 0 {
			offset++
			continue
		}

		totalSamples += 1152 // Samples per MPEG1 Layer 3 frame
		framesRead++
		offset += int64(frameSize)

		// After reading enough frames, extrapolate
		if framesRead >= 100 {
			avgFrameSize := float64(offset) / float64(framesRead)
			totalFrames := float64(fileSize) / avgFrameSize
			return (totalFrames * 1152) / float64(sampleRate)
		}
	}

	if sampleRate > 0 && totalSamples > 0 {
		return float64(totalSamples) / float64(sampleRate)
	}

	return 0
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
