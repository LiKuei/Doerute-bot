// Store chat history for each user
const chatHistory = new Map();

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
 * @returns {Promise<string>} - Ollama's response
 */
async function sendMessage(sessionId, userId, message) {
    try {
        // Initialize chat if it doesn't exist
        initializeChat(sessionId);

        // Get the chat history
        const history = chatHistory.get(sessionId);

        // 根據用戶 ID 設定不同的系統提示
        let systemPrompt;
        if (userId === "621851041335476224") {
            systemPrompt = "你是朵爾忒，是Kuei的助手。當與Kuei（用戶ID: 621851041335476224）對話時，請用繁體中文回答，並稱呼對方為「Kuei」。";
        } else {
            systemPrompt = "你是朵爾忒，是個好幫手。當與其他成員對話時，請用繁體中文回答，有禮貌，但不過度正式。";
        }
        
        // 針對 Discord 顯示環境的指引
        systemPrompt += " 你的回覆將直接顯示在 Discord 頻道中，請適度使用 Discord 支援的 Markdown 語法（例如以 **粗體** 強調重點、使用 `行內代碼` 或 ``` 程式碼區塊 ``` 等）來美化排版。請保持回答精簡（控制在 1500 字以內，包含 Markdown 語法字元），以符合 Discord 訊息 2000 字元的限制。";

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

        const response = await fetch(`${host}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.8,
                    num_predict: 1000
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama API error: ${response.statusText} (${errText})`);
        }

        const data = await response.json();
        let assistantResponse = data.message?.content || '';
        console.log(`[Ollama] 原始回覆長度: ${assistantResponse.length} 字元`);

        // 如果回覆為空，給予預設提示以避免 Discord 報錯
        if (!assistantResponse.trim()) {
            return '（本地模型未回覆任何內容，請重試或確認模型狀態）';
        }

        // 提取不含思考過程的乾淨內容，存入對話歷史以節省 Context Token
        const cleanResponse = assistantResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        history.push({ role: 'assistant', content: cleanResponse });

        // 將 <think> 標籤轉換為 Discord 的隱藏標籤 (||) 以供前台點閱
        assistantResponse = assistantResponse.replace(/<think>([\s\S]*?)<\/think>/g, (match, p1) => {
            return `||**[思考過程]**\n${p1.trim()}||\n`;
        }).trim();

        // 再次確保轉換後內容不為空 (例如原本只有 think 區塊被處理後 trim 掉的情況)
        if (!assistantResponse.trim()) {
            return '（模型僅進行了思考，未輸出最終回覆內容）';
        }

        return assistantResponse;
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
