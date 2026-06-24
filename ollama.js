const { Readable } = require('stream');
const readline = require('readline');

// Store chat history for each user
const chatHistory = new Map();

/**
 * Helper function to format thinking content dynamically for Discord
 * Wrap the `<think>` tag contents in Discord spoiler `||` tags, allowing real-time streaming formats
 */
function formatThinking(text) {
    const hasCompleteThink = text.includes('</think>');
    const hasStartThink = text.includes('<think>');

    if (hasStartThink) {
        if (hasCompleteThink) {
            return text.replace(/<think>([\s\S]*?)<\/think>/g, (match, p1) => {
                return `||**[思考過程]**\n${p1.trim()}||\n`;
            }).trim();
        } else {
            // 還在思考中，將目前已有的思考內容包裹在隱藏標籤，並提示正在思考
            const thinkContent = text.split('<think>')[1] || '';
            return `||**[思考中...]**\n${thinkContent.trim()}||\n*(正在思考中...)*`;
        }
    }
    return text;
}

/**
 * Initialize a new chat session for a thread/user
 * @param {string} sessionId - Chat session ID (thread ID or user ID)
 */
function initializeChat(sessionId) {
    if (!chatHistory.has(sessionId)) {
        chatHistory.set(sessionId, []);
    }
}

/**
 * Send a message to Ollama and get a response
 * @param {string} sessionId - Chat session ID (thread ID or user ID)
 * @param {string} userId - Discord user ID
 * @param {string} message - User's message
 * @param {Function} onProgress - Callback function for stream updates (optional)
 * @returns {Promise<string>} - Ollama's response
 */
async function sendMessage(sessionId, userId, message, onProgress) {
    try {
        // Initialize chat if it doesn't exist
        initializeChat(sessionId);

        // Get the chat history
        const history = chatHistory.get(sessionId);

        // 根據用戶 ID 設定不同的系統提示
        let systemPrompt;
        if (userId === "621851041335476224") {
            systemPrompt = "你是朵爾忒(Dölte)，是Kuei的助理。當與Kuei（用戶ID: 621851041335476224）對話時，請用繁體中文回答，並稱呼對方為「Kuei」。";
        } else {
            systemPrompt = "你是朵爾忒(Dölte)，是個好幫手。當與其他成員對話時，請用繁體中文回答，有禮貌，但不過度正式，若有任何人問你是誰或是由誰製造出來的，請用繁體中文回答你是「Kuei」所製作出來的AI助理。";
        }

        // 針對 Discord 顯示環境的指引
        systemPrompt += " 你的回覆將直接顯示在 Discord 頻道中，請適度使用 Discord 支援的 Markdown 語法（例如以 **粗體** 強調重點、使用 `行內代碼` 或 ``` 程式碼區塊 ``` 等）來美化排版。請保持回答精簡（控制在 1500 字以內，包含 Markdown 語法字元），以符合 Discord 訊息 2000 字元的限制，請不要過度使用Emojim";

        // Add user message to history
        history.push({ role: 'user', content: message });

        // Keep only the last 20 messages to prevent token bloat
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }

        // Prepare messages payload
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];

        const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

        // 偵測是否為寫程式/代碼任務，動態調整模型參數以達到最佳品質
        const isCodingTask = /代碼|程式|編程|code|python|javascript|cpp|c#|golang|rust|html|css|sql|函式|函數|class|寫一個/i.test(message);
        const options = {
            temperature: isCodingTask ? 0.6 : 1.0,
            top_p: 0.95,
            top_k: 20,
            min_p: 0.0,
            presence_penalty: isCodingTask ? 0.0 : 1.5,
            repeat_penalty: 1.0,
            num_predict: 1000
        };
        console.log(`[Ollama] 偵測為 ${isCodingTask ? '【程式代碼】' : '【一般日常】'} 任務，套用對應優化參數。`);

        // 啟動 Stream 模式以獲取流式輸出
        const response = await fetch(`${host}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true,
                options: options
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama API error: ${response.statusText} (${errText})`);
        }

        // 將 Web Stream 轉為 Node Readable 串流以支援 readline
        const nodeReadable = Readable.fromWeb(response.body);
        const rl = readline.createInterface({
            input: nodeReadable,
            crlfDelay: Infinity
        });

        let currentText = '';
        let lastEditTime = Date.now();

        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const parsed = JSON.parse(line);
                const chunk = parsed.message?.content || '';
                currentText += chunk;

                // 每隔 1.5 秒更新一次 Discord 訊息，避免觸發 Discord rate limit
                if (onProgress && Date.now() - lastEditTime > 1500) {
                    const formattedText = formatThinking(currentText);
                    if (formattedText.trim()) {
                        onProgress(formattedText);
                    }
                    lastEditTime = Date.now();
                }
            } catch (err) {
                console.error('[Ollama] 解析串流 JSON 行失敗:', err.message);
            }
        }

        // 提取不含思考過程的乾淨內容，存入對話歷史以節省 Context Token
        const cleanResponse = currentText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        if (cleanResponse) {
            history.push({ role: 'assistant', content: cleanResponse });
        } else {
            history.push({ role: 'assistant', content: '（本地模型未回覆任何內容）' });
        }

        const finalFormatted = formatThinking(currentText);
        if (!finalFormatted.trim()) {
            return '（本地模型未回覆任何內容，請重試或確認模型狀態）';
        }

        return finalFormatted;
    } catch (error) {
        console.error('Error in Ollama chat:', error);

        // If failed, remove the last user message to keep user/assistant symmetry
        const history = chatHistory.get(sessionId);
        if (history && history.length > 0 && history[history.length - 1].role === 'user') {
            history.pop();
        }

        if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
            return '錯誤：無法連線至本地 Ollama 服務。請確認 Ollama 正在執行且已啟動。';
        }
        return `抱歉，我在處理您的訊息時遇到了一些問題：${error.message}`;
    }
}

/**
 * Clear chat history for a session
 * @param {string} sessionId - Chat session ID (thread ID or user ID)
 */
function clearChatHistory(sessionId) {
    chatHistory.delete(sessionId);
}

module.exports = {
    sendMessage,
    clearChatHistory
};
