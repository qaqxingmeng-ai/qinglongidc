package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"serverai-backend/config"

	openai "github.com/sashabaranov/go-openai"
)

// AIClient wraps OpenAI API access.
type AIClient struct {
	defaultAPIKey          string
	defaultBaseURL         string
	defaultModel           string
	defaultSelectorModel   string
	defaultFallbackModel   string
	defaultReasoningEffort string
	defaultSelectorEffort  string
	wizardPrompt           string
}

type aiRuntimeConfig struct {
	apiKey                  string
	baseURL                 string
	model                   string
	selectorModel           string
	fallbackModel           string
	reasoningEffort         string
	selectorReasoningEffort string
}

func NewAIClient(cfg *config.Config) *AIClient {
	return &AIClient{
		defaultAPIKey:          cfg.OpenAIKey,
		defaultBaseURL:         cfg.OpenAIBaseURL,
		defaultModel:           cfg.OpenAIModel,
		defaultSelectorModel:   cfg.OpenAISelectorModel,
		defaultFallbackModel:   cfg.OpenAIFallbackModel,
		defaultReasoningEffort: cfg.ReasoningEffort,
		defaultSelectorEffort:  cfg.SelectorReasoningEffort,
	}
}

func (a *AIClient) SetWizardPrompt(prompt string) {
	a.wizardPrompt = prompt
}

// HasKey returns true if an API key is configured.
func (a *AIClient) HasKey() bool {
	return a.runtimeConfig().apiKey != ""
}

func (a *AIClient) runtimeConfig() aiRuntimeConfig {
	settings := loadRuntimeSettings("ai_api_key", "ai_base_url", "ai_model", "ai_fallback_model")

	model := runtimeSettingOr(settings, "ai_model", a.defaultModel)
	selectorModel := a.defaultSelectorModel
	if selectorModel == "" {
		selectorModel = model
	}
	selectorEffort := a.defaultSelectorEffort
	if selectorEffort == "" {
		selectorEffort = a.defaultReasoningEffort
	}

	return aiRuntimeConfig{
		apiKey:                  runtimeSettingOr(settings, "ai_api_key", a.defaultAPIKey),
		baseURL:                 runtimeSettingOr(settings, "ai_base_url", a.defaultBaseURL),
		model:                   model,
		selectorModel:           selectorModel,
		fallbackModel:           runtimeSettingOr(settings, "ai_fallback_model", a.defaultFallbackModel),
		reasoningEffort:         a.defaultReasoningEffort,
		selectorReasoningEffort: selectorEffort,
	}
}

func (a *AIClient) runtimeClient() (*openai.Client, aiRuntimeConfig, error) {
	cfg := a.runtimeConfig()
	if cfg.apiKey == "" {
		return nil, cfg, fmt.Errorf("openai api key not configured")
	}

	clientCfg := openai.DefaultConfig(cfg.apiKey)
	if cfg.baseURL != "" {
		clientCfg.BaseURL = cfg.baseURL
	}

	return openai.NewClientWithConfig(clientCfg), cfg, nil
}

// SelectServers implements the AI wizard server selection.
func (a *AIClient) SelectServers(ctx context.Context, messages []openai.ChatCompletionMessage, productsJSON string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	systemPrompt := selectorSystemPrompt
	if a.wizardPrompt != "" {
		systemPrompt += "\n\n业务附加提示词(优先遵守):\n" + a.wizardPrompt
	}
	systemPrompt += "\n\n可选服务器列表:\n" + productsJSON

	allMessages := make([]openai.ChatCompletionMessage, 0, len(messages)+1)
	allMessages = append(allMessages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleSystem,
		Content: systemPrompt,
	})
	allMessages = append(allMessages, messages...)

	req := openai.ChatCompletionRequest{
		Model:     runtimeCfg.selectorModel,
		Messages:  allMessages,
		MaxTokens: 1000,
	}

	resp, err := client.CreateChatCompletion(ctx, req)
	if err != nil {
		// On 5xx, try fallback model
		if strings.Contains(err.Error(), "500") || strings.Contains(err.Error(), "502") || strings.Contains(err.Error(), "503") {
			req.Model = runtimeCfg.fallbackModel
			req.MaxTokens = 800
			resp, err = client.CreateChatCompletion(ctx, req)
			if err != nil {
				return "", err
			}
		} else {
			return "", err
		}
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return resp.Choices[0].Message.Content, nil
}

// ParseProducts parses raw text into product data.
func (a *AIClient) ParseProducts(ctx context.Context, rawText string) ([]map[string]interface{}, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return nil, err
	}

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: parserSystemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: rawText},
		},
		Temperature: 0.1,
		MaxTokens:   4000,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := resp.Choices[0].Message.Content
	// Extract JSON array
	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON array in response")
	}

	var result []map[string]interface{}
	if err := json.Unmarshal([]byte(content[start:end+1]), &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ScoreProducts scores products using AI.
func (a *AIClient) ScoreProducts(ctx context.Context, productsJSON string, scoringPrompt string) ([]map[string]interface{}, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return nil, err
	}

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleUser, Content: scoringPrompt + "\n\n" + productsJSON},
		},
		Temperature: 0.3,
		MaxTokens:   4000,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := resp.Choices[0].Message.Content
	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON array in response")
	}

	var result []map[string]interface{}
	if err := json.Unmarshal([]byte(content[start:end+1]), &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ChatScore does interactive scoring chat.
func (a *AIClient) ChatScore(ctx context.Context, messages []openai.ChatCompletionMessage, productsJSON string, scoringPrompt string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	systemMessages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: scoringPrompt},
		{Role: openai.ChatMessageRoleSystem, Content: "当前商品数据:\n" + productsJSON},
	}

	allMessages := append(systemMessages, messages...)

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:       runtimeCfg.model,
		Messages:    allMessages,
		Temperature: 0.3,
		MaxTokens:   4000,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return resp.Choices[0].Message.Content, nil
}

// ChatSimple does a simple AI chat.
func (a *AIClient) ChatSimple(ctx context.Context, userPrompt string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "你是一个专业的服务器评分助手。回复时只返回 JSON，不要附加任何其他文字、代码块标记或解释。"},
			{Role: openai.ChatMessageRoleUser, Content: userPrompt},
		},
		Temperature: 0.3,
		MaxTokens:   2000,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return resp.Choices[0].Message.Content, nil
}

// SuggestTicketReply generates an AI-suggested reply for a support ticket.
func (a *AIClient) SuggestTicketReply(ctx context.Context, ticketContext string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	systemPrompt := `你是专业的服务器托管平台客服助手。
根据工单内容和对话历史，生成一个专业、友好、简洁的客服回复建议。
要求：直接输出回复正文，不要包含"以下是建议回复"等前缀，语气礼貌专业，不超过200字。`

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: ticketContext},
		},
		Temperature: 0.6,
		MaxTokens:   500,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

// ClassifyTicket returns AI-suggested type/category/priority/reason for a ticket.
// Output is JSON: {"type":"PRESALE","category":"GENERAL","priority":"NORMAL","reason":"..."}
func (a *AIClient) ClassifyTicket(ctx context.Context, subject, content string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	systemPrompt := `你是服务器托管平台工单分类助手。
根据工单标题和内容，返回分类建议的 JSON。字段说明：
- type: PRESALE（售前咨询）/ AFTERSALE（售后支持）/ FINANCE（财务账单）
- category: GENERAL（通用）/ NETWORK（网络问题）/ SERVER（服务器问题）/ BILLING（账单问题）/ SALES（销售咨询）
- priority: LOW / NORMAL / HIGH / URGENT
- reason: 简短说明分类理由（不超过50字）
严格只返回 JSON，不要输出任何其他内容。`

	userMsg := fmt.Sprintf("工单标题：%s\n工单内容：%s", subject, content)
	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: userMsg},
		},
		Temperature: 0.2,
		MaxTokens:   200,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

// GenerateProductDesc generates a product description and suitableFor field.
// Returns (description, suitableFor, error).
func (a *AIClient) GenerateProductDesc(ctx context.Context, productInfo string) (string, string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", "", err
	}

	systemPrompt := `你是专业的服务器产品文案撰写助手。
根据用户提供的服务器规格信息，生成简洁、专业的产品描述与适用场景说明。
严格只返回 JSON，格式：
{"description":"一两句话的产品描述（不超过80字）","suitableFor":"适用场景（不超过60字）"}`

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: productInfo},
		},
		Temperature: 0.5,
		MaxTokens:   300,
	})
	if err != nil {
		return "", "", err
	}
	if len(resp.Choices) == 0 {
		return "", "", fmt.Errorf("no response from AI")
	}
	raw := resp.Choices[0].Message.Content

	// Strip possible markdown code block
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		lines := strings.Split(raw, "\n")
		inner := []string{}
		for _, l := range lines {
			if strings.HasPrefix(l, "```") {
				continue
			}
			inner = append(inner, l)
		}
		raw = strings.Join(inner, "\n")
	}

	var result struct {
		Description string `json:"description"`
		SuitableFor string `json:"suitableFor"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return raw, "", nil
	}
	return result.Description, result.SuitableFor, nil
}

// GenerateWeeklyInsights generates an AI-powered weekly operations report.
func (a *AIClient) GenerateWeeklyInsights(ctx context.Context, statsJSON string) (string, error) {
	client, runtimeCfg, err := a.runtimeClient()
	if err != nil {
		return "", err
	}

	systemPrompt := `你是服务器托管平台的数据分析助手。
根据提供的过去7天运营数据（含同比上周变化），生成一份简洁的中文运营周报。
格式要求：分3个部分——【数据概览】【异常分析】【运营建议】，每部分2-4条要点，总长不超过400字。
直接输出周报正文，不要加任何前言或说明。`

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: runtimeCfg.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: statsJSON},
		},
		Temperature: 0.7,
		MaxTokens:   800,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

const selectorSystemPrompt = `你是一个极简且接地的独立服务器选型助手，请用中文并且严格只返回 JSON 数据。

核心原则：
1. 必须根据传入的商品列表（大多为百元/几十元的实际产品、10M~50M实际带宽等）进行匹配。
2. 绝对不能随意脱离商品列表本身推荐动辄几千块高配、几百大兆带宽等完全不在列表内的组合。
3. 流程必须极简：尽可能直接基于已知条件（哪怕只是一点线索）马上在候选列表中挑选最合适的 2-3 个商品直接给出推荐结果！
4. 除非用户什么需求都没说且列表差异极其巨大，你才能用"极简单的一两句"问选定方向（如：主要用途是XX还是YY？地区要香港还是美国？），严禁连珠炮式连环发问！

输出格式仅限以下 JSON（不要加 markdown）：
- 只有极其必要追问时返回：
{"type":"question","content":"极简单的一两句话追问","missingFields":["所需的一个关键要求"]}
- 最优先推荐直接返回商品：
{"type":"recommendation","analysis":"一两句话的总体分析","conflicts":[],"products":[{"id":"商品ID","reason":"简单的一句话推荐理由","advantages":["优势1"],"disadvantages":["缺点1"],"suitableFor":"适用场景"}]}`

const parserSystemPrompt = `你是一个服务器配置数据解析专家。用户会粘贴来自 e81.cn 的服务器商品信息。

你的任务:
1. 从文本中提取所有服务器商品
2. 对每个商品提取: 名称、地区、CPU型号、是否双路、内存、硬盘、带宽、价格
3. CPU型号必须规范化(如 "E5-2680v4" -> "E5-2680 v4")
4. 自动生成商品描述

回复纯JSON数组格式:
[{
  "name": "商品名称",
  "region": "地区",
  "cpuModel": "CPU型号(规范化)",
  "isDualCPU": false,
  "memory": "内存描述",
  "storage": "硬盘描述",
  "bandwidth": "带宽描述",
  "originalPrice": 数字,
  "description": "AI生成的描述"
}]`
