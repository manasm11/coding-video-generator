package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"sync"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/models"
	"coding-video-generator/internal/progress"
	"coding-video-generator/internal/sse"
)

var styleDescriptions = map[models.StyleLevel]string{
	models.StyleBeginner:     "very simple, with detailed explanations of every concept",
	models.StyleIntermediate: "moderately complex, assuming familiarity with basic programming concepts",
	models.StyleAdvanced:     "complex, assuming deep knowledge of the language and programming patterns",
}

func buildPrompt(prompt, language string, style models.StyleLevel) string {
	styleDesc, ok := styleDescriptions[style]
	if !ok {
		styleDesc = styleDescriptions[models.StyleBeginner]
	}

	return fmt.Sprintf(`You are an expert programming instructor creating video tutorial content.
Generate structured tutorial content that will be used to create an educational coding video.

Your response MUST be valid JSON matching this exact structure:
{
  "title": "A concise, descriptive title for the tutorial",
  "steps": [
    {
      "code": "The code snippet for this step (properly escaped for JSON)",
      "explanation": "A clear, spoken explanation of what this code does (2-3 sentences, suitable for text-to-speech narration)",
      "language": "The programming language"
    }
  ]
}

Guidelines:
- Create 3-6 logical steps that build upon each other
- Each code snippet should be complete and runnable when possible
- Explanations should be conversational and suitable for narration
- The difficulty level should be: %s
- Use %s for all code examples
- Make explanations engaging but concise (good for 10-20 seconds of narration each)
- Escape any special characters in code properly for JSON

Create a coding tutorial about: %s

Respond with ONLY valid JSON, no markdown code blocks or additional text.`, styleDesc, language, prompt)
}

// GenerateTutorialContent runs the Claude CLI and parses the output.
func GenerateTutorialContent(
	ctx context.Context,
	prompt, language string,
	style models.StyleLevel,
	tracker *progress.Tracker,
	sseManager *sse.Manager,
	jobID string,
) (*models.TutorialContent, error) {
	fullPrompt := buildPrompt(prompt, language, style)

	if tracker != nil {
		tracker.UpdateProgress(10, "Preparing prompt for AI...", nil)
	}

	ctx, cancel := context.WithTimeout(ctx, config.ContentGenerationTimeout)
	defer cancel()

	if tracker != nil {
		tracker.UpdateProgress(20, "AI is generating content...", nil)
	}

	cmd := exec.CommandContext(ctx, "claude", "-p", fullPrompt, "--output-format", "json")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start claude CLI: %w", err)
	}

	var stdoutData, stderrData strings.Builder
	hasReceivedData := false
	var wg sync.WaitGroup

	wg.Add(2)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			stdoutData.WriteString(line)
			stdoutData.WriteString("\n")

			if sseManager != nil && jobID != "" {
				sseManager.Broadcast(jobID, sse.EventStdout, line)
			}

			if !hasReceivedData {
				hasReceivedData = true
				if tracker != nil {
					tracker.UpdateProgress(50, "Receiving AI response...", nil)
				}
			}
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			stderrData.WriteString(line)
			stderrData.WriteString("\n")

			if sseManager != nil && jobID != "" {
				sseManager.Broadcast(jobID, sse.EventStderr, line)
			}
		}
	}()

	wg.Wait()

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("claude CLI failed: %w: %s", err, stderrData.String())
	}

	if tracker != nil {
		tracker.UpdateProgress(80, "Parsing tutorial content...", nil)
	}

	content, err := parseTutorialContent(stdoutData.String())
	if err != nil {
		return nil, err
	}

	if tracker != nil {
		tracker.UpdateProgress(100, "Content generation complete", nil)
	}

	return content, nil
}

func parseTutorialContent(rawOutput string) (*models.TutorialContent, error) {
	text := rawOutput

	// Try to extract from CLI JSON wrapper
	var cliResponse map[string]interface{}
	if err := json.Unmarshal([]byte(text), &cliResponse); err == nil {
		if result, ok := cliResponse["result"].(string); ok {
			text = result
		}
	}

	// Extract JSON from potential markdown code blocks
	jsonStr := text
	codeBlockRe := regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)```")
	if match := codeBlockRe.FindStringSubmatch(jsonStr); len(match) > 1 {
		jsonStr = match[1]
	}

	// Extract just the JSON object if there's extra text
	objectRe := regexp.MustCompile(`(?s)\{.*\}`)
	if match := objectRe.FindString(jsonStr); match != "" {
		jsonStr = match
	}

	var contentDict map[string]interface{}
	if err := json.Unmarshal([]byte(strings.TrimSpace(jsonStr)), &contentDict); err != nil {
		return nil, fmt.Errorf("failed to parse tutorial content: %w", err)
	}

	title, _ := contentDict["title"].(string)
	if title == "" {
		return nil, fmt.Errorf("invalid tutorial structure: missing title")
	}

	stepsRaw, ok := contentDict["steps"].([]interface{})
	if !ok || len(stepsRaw) == 0 {
		return nil, fmt.Errorf("invalid tutorial structure: missing or empty steps")
	}

	var steps []models.TutorialStep
	for _, s := range stepsRaw {
		stepMap, ok := s.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid step structure")
		}
		code, _ := stepMap["code"].(string)
		explanation, _ := stepMap["explanation"].(string)
		lang, _ := stepMap["language"].(string)
		if code == "" || explanation == "" || lang == "" {
			return nil, fmt.Errorf("invalid step structure: missing code, explanation, or language")
		}
		steps = append(steps, models.TutorialStep{
			Code:        code,
			Explanation: explanation,
			Language:    lang,
		})
	}

	return &models.TutorialContent{
		Title: title,
		Steps: steps,
	}, nil
}
