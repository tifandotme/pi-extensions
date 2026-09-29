---
"@tifan/pi-recap": patch
---

Fix `/recap` failing with "Recap generation failed." on opencode.ai-backed models such as `opencode` and `opencode-go`. Recaps now work against those models, wait longer before timing out, and report the provider's reason when generation fails.
