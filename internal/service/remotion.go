package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/models"
	"coding-video-generator/internal/progress"
)

// killStaleChrome finds and kills any leftover chrome-headless-shell processes
// from previous renders to free memory before starting a new render.
func killStaleChrome() {
	out, _ := exec.Command("pkill", "-f", "chrome-headless-shell").CombinedOutput()
	log.Printf("Cleaned up stale Chrome processes: %s", string(out))
}

// RenderVideo renders a video using Remotion via Node.js subprocess.
func RenderVideo(
	ctx context.Context,
	jobID string,
	content *models.TutorialContent,
	audioFiles []string,
	tracker *progress.Tracker,
) (string, error) {
	killStaleChrome()

	outputDir := config.OutputDir
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}

	if tracker != nil {
		tracker.UpdateProgress(5, "Preparing audio for rendering...", nil)
	}

	// Log Go-measured durations for diagnostics (actual durations measured by Remotion via calculateMetadata)
	for i, audioFile := range audioFiles {
		duration := GetAudioDuration(audioFile)
		log.Printf("[%s] Step %d audio duration (Go-measured): %.2fs", jobID, i, duration)
	}

	// Build audio HTTP URLs
	var audioFileURLs []string
	for i := range audioFiles {
		audioFileURLs = append(audioFileURLs,
			fmt.Sprintf("http://localhost%s/api/audio/%s/%d", config.ServerPort, jobID, i))
	}

	// Build input props (stepDurations left empty — calculated by Remotion's calculateMetadata)
	inputProps := map[string]interface{}{
		"content":       content,
		"audioFiles":    audioFileURLs,
		"stepDurations": []int{},
	}

	outputPath := filepath.Join(outputDir, jobID+".mp4")

	if tracker != nil {
		tracker.UpdateProgress(10, "Starting Remotion render...", nil)
	}

	remotionDir, _ := filepath.Abs(config.RemotionDir)
	projectRoot, _ := filepath.Abs(config.ProjectRoot)

	inputPropsJSON, err := json.Marshal(inputProps)
	if err != nil {
		return "", fmt.Errorf("failed to marshal input props: %w", err)
	}

	absOutputPath, _ := filepath.Abs(outputPath)

	renderScript := fmt.Sprintf(`
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');

async function main() {
    const entryPoint = path.join(%s, 'index.ts');
    const inputProps = %s;
    const outputPath = %s;

    console.log(JSON.stringify({ type: 'progress', phase: 'bundling', percent: 0 }));

    const bundleLocation = await bundle({
        entryPoint,
        onProgress: (progress) => {
            console.log(JSON.stringify({ type: 'progress', phase: 'bundling', percent: progress }));
        },
    });

    console.log(JSON.stringify({ type: 'progress', phase: 'selecting', percent: 100 }));

    const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'CodingTutorial',
        inputProps,
        timeoutInMilliseconds: 120000,
        chromiumOptions: {
            enableMultiProcessOnLinux: false,
            args: ['--disable-dev-shm-usage', '--disable-gpu'],
        },
    });

    console.log(JSON.stringify({ type: 'progress', phase: 'rendering', percent: 0 }));

    await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps,
        concurrency: 1,
        chromiumOptions: {
            enableMultiProcessOnLinux: false,
            args: ['--disable-dev-shm-usage', '--disable-gpu'],
        },
        onProgress: ({ progress }) => {
            console.log(JSON.stringify({ type: 'progress', phase: 'rendering', percent: progress * 100 }));
        },
    });

    console.log(JSON.stringify({ type: 'complete', outputPath }));
}

main().catch((err) => {
    console.error(JSON.stringify({ type: 'error', message: err.message }));
    process.exit(1);
});
`,
		jsonQuote(remotionDir),
		string(inputPropsJSON),
		jsonQuote(absOutputPath),
	)

	timeout := config.VideoRenderTimeout + config.RemotionBundleTimeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "node", "--max-old-space-size=1024", "-e", renderScript)
	cmd.Dir = projectRoot

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start remotion render: %w", err)
	}

	defer func() {
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		time.Sleep(500 * time.Millisecond)
		killStaleChrome()
	}()

	var wg sync.WaitGroup

	wg.Add(2)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdoutPipe)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			lineText := scanner.Text()
			if lineText == "" {
				continue
			}

			var data map[string]interface{}
			if err := json.Unmarshal([]byte(lineText), &data); err != nil {
				log.Printf("Remotion: %s", lineText)
				continue
			}

			if data["type"] == "progress" && tracker != nil {
				phase, _ := data["phase"].(string)
				percent, _ := data["percent"].(float64)

				switch phase {
				case "bundling":
					mapped := 10 + (percent * 0.3)
					tracker.UpdateProgress(mapped, fmt.Sprintf("Bundling: %d%%", int(percent)), nil)
				case "selecting":
					tracker.UpdateProgress(40, "Bundle complete, preparing composition...", nil)
				case "rendering":
					mapped := 50 + (percent * 0.5)
					tracker.UpdateProgress(mapped, fmt.Sprintf("Rendering video: %d%%", int(percent)), nil)
				}
			} else if data["type"] == "complete" {
				if tracker != nil {
					tracker.UpdateProgress(100, "Video render complete!", nil)
				}
				log.Println("Video rendered successfully!")
			}
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			log.Printf("Remotion stderr: %s", scanner.Text())
		}
	}()

	wg.Wait()

	if err := cmd.Wait(); err != nil {
		return "", fmt.Errorf("remotion render failed: %w", err)
	}

	return absOutputPath, nil
}

// jsonQuote returns a JSON-encoded string for embedding in JS.
func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// DeleteVideo removes the video file for a job.
func DeleteVideo(jobID string) {
	videoPath := filepath.Join(config.OutputDir, jobID+".mp4")
	os.Remove(videoPath)
}

// GetVideoPath returns the video path if it exists.
func GetVideoPath(jobID string) string {
	videoPath := filepath.Join(config.OutputDir, jobID+".mp4")
	if _, err := os.Stat(videoPath); err == nil {
		p, _ := filepath.Abs(videoPath)
		return p
	}
	return ""
}
