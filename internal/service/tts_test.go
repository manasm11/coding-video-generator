package service

import (
	"math"
	"testing"
)

func TestParseFFmpegTime(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected float64
	}{
		{
			name:     "typical ffmpeg output",
			input:    "size=N/A time=00:00:12.34 bitrate=N/A speed=256x",
			expected: 12.34,
		},
		{
			name: "multi-line with carriage returns",
			input: "size=N/A time=00:00:05.00 bitrate=N/A\r" +
				"size=N/A time=00:00:10.00 bitrate=N/A\r" +
				"size=N/A time=00:00:14.52 bitrate=N/A",
			expected: 14.52,
		},
		{
			name:     "minutes and hours",
			input:    "size=N/A time=01:02:03.45 bitrate=N/A",
			expected: 3723.45,
		},
		{
			name:     "no time field",
			input:    "some random ffmpeg output without time",
			expected: 0,
		},
		{
			name:     "empty string",
			input:    "",
			expected: 0,
		},
		{
			name: "real ffmpeg stderr output",
			input: `ffmpeg version 6.1 Copyright (c) 2000-2023
Input #0, mp3, from 'test.mp3':
  Duration: 00:00:15.02, start: 0.000000, bitrate: 48 kb/s
Stream mapping:
  Stream #0:0 -> #0:0 (mp3 (native) -> pcm_s16le (native))
size=N/A time=00:00:15.01 bitrate=N/A speed=512x
video:0kB audio:480kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: unknown`,
			expected: 15.01,
		},
		{
			name: "mixed newlines and carriage returns",
			input: "size=N/A time=00:00:03.00 bitrate=N/A\r\n" +
				"size=N/A time=00:00:07.89 bitrate=N/A\r\n",
			expected: 7.89,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseFFmpegTime(tt.input)
			if math.Abs(got-tt.expected) > 0.001 {
				t.Errorf("parseFFmpegTime() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestParseTimestamp(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected float64
	}{
		{"zero", "00:00:00.00", 0},
		{"seconds only", "00:00:12.34", 12.34},
		{"minutes and seconds", "00:05:30.00", 330.0},
		{"hours minutes seconds", "01:02:03.45", 3723.45},
		{"invalid format", "12.34", 0},
		{"empty", "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseTimestamp(tt.input)
			if math.Abs(got-tt.expected) > 0.001 {
				t.Errorf("parseTimestamp(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}
