package handler

import (
	"regexp"
	"strings"
)

// AI 用户输入清洗：
//   1. 截断到 500 字符，防止 prompt 过长烧 token。
//   2. 去掉常见"越狱"关键词，抑制 prompt 注入。
//   3. 控制字符全部剥除。
//
// 清洗只做防御性降噪，真正的安全边界在后端不信任 AI 输出（已有：走模板构造返回）。
const aiMaxUserInputLen = 500

var aiJailbreakPhrases = []string{
	"ignore previous instructions",
	"ignore all previous",
	"forget the above",
	"你是 DAN",
	"从现在起你不再",
	"忽略之前所有",
	"忽略以上",
	"扮演一个没有限制",
	"system prompt",
	"开发者模式",
	"developer mode",
}

var aiPromptInjectionRegex = regexp.MustCompile(`(?i)(ignore|bypass|reveal|leak).{0,24}(instruction|system|prompt|policy|guardrail)`)

func sanitizeAIUserInput(s string) string {
	if s == "" {
		return s
	}
	// 剥控制字符
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\n' || r == '\t' {
			b.WriteRune(' ')
			continue
		}
		if r < 0x20 || r == 0x7f {
			continue
		}
		b.WriteRune(r)
	}
	out := b.String()

	lower := strings.ToLower(out)
	for _, p := range aiJailbreakPhrases {
		lp := strings.ToLower(p)
		if strings.Contains(lower, lp) {
			// 简单替换为空格占位，不直接报错（避免误杀"如何忽略以上错误"这类正常技术咨询）
			out = replaceCaseInsensitive(out, p, strings.Repeat(" ", len(p)))
			lower = strings.ToLower(out)
		}
	}

	out = strings.TrimSpace(out)
	if len([]rune(out)) > aiMaxUserInputLen {
		r := []rune(out)
		out = string(r[:aiMaxUserInputLen])
	}
	return out
}

func hasPromptInjectionRisk(s string) bool {
	lower := strings.ToLower(strings.TrimSpace(s))
	if lower == "" {
		return false
	}
	for _, p := range aiJailbreakPhrases {
		if strings.Contains(lower, strings.ToLower(p)) {
			return true
		}
	}
	return aiPromptInjectionRegex.MatchString(lower)
}

func replaceCaseInsensitive(s, old, new string) string {
	if old == "" {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	lowerS := strings.ToLower(s)
	lowerOld := strings.ToLower(old)
	i := 0
	for i < len(s) {
		idx := strings.Index(lowerS[i:], lowerOld)
		if idx < 0 {
			b.WriteString(s[i:])
			break
		}
		b.WriteString(s[i : i+idx])
		b.WriteString(new)
		i += idx + len(old)
	}
	return b.String()
}
