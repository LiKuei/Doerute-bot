const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API with specific version
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
    apiVersion: 'v1'
});

// Create a chat model with specific configurations
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",  // 使用 Gemini 2.0 Flash
    generationConfig: {
        temperature: 0.7,        // 控制回答的創造性 (0.0-1.0)
        topP: 0.8,              // 控制回答的多樣性
        topK: 40,               // 控制詞彙選擇的範圍
        maxOutputTokens: 1000,  // 最大輸出長度
    },
    safetySettings: [
        {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
    ]
});

// Store chat history for each user
const chatHistory = new Map();

/**
 * Initialize a new chat session for a user
 * @param {string} userId - Discord user ID
 */
function initializeChat(userId) {
    if (!chatHistory.has(userId)) {
        chatHistory.set(userId, model.startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 1000,
            },
        }));
    }
}

/**
 * Send a message to Gemini and get a response
 * @param {string} userId - Discord user ID
 * @param {string} message - User's message
 * @returns {Promise<string>} - Gemini's response
 */
async function sendMessage(userId, message) {
    try {
        // Initialize chat if it doesn't exist
        initializeChat(userId);
        
        // Get the chat session
        const chat = chatHistory.get(userId);
        
        // 根據用戶 ID 設定不同的系統提示
        let systemPrompt;
        if (userId === "621851041335476224") {
            systemPrompt = "你是朵爾忒，是個女僕。當與主人（用戶ID: 621851041335476224）對話時，請用中文回答，並稱呼對方為「主人」。回答要簡潔、專業且友善，帶有女僕的語氣。";
        } else {
            systemPrompt = "你是朵爾忒，是個好幫手。當與其他成員對話時，請用中文回答，語氣要稍微冷淡但保持專業。回答要簡潔，不需要過於熱情，但仍然要提供有用的資訊。";
        }
        
        // Send message and get response
        const result = await chat.sendMessage(`${systemPrompt}\n\n用戶訊息：${message}`);
        const response = await result.response;
        
        // Check if response was blocked by safety settings
        if (response.promptFeedback?.blockReason) {
            return '抱歉，您的訊息可能包含不適當的內容，請重新輸入。';
        }
        
        return response.text();
    } catch (error) {
        console.error('Error in Gemini chat:', error);
        
        // Handle specific error cases
        if (error.message.includes('API key')) {
            return '錯誤：API 金鑰設定有誤，請檢查環境變數設定。';
        } else if (error.message.includes('quota')) {
            return '抱歉，目前 API 使用配額已達上限，請稍後再試。';
        } else {
            return '抱歉，我在處理您的訊息時遇到了一些問題。請稍後再試。';
        }
    }
}

/**
 * Clear chat history for a user
 * @param {string} userId - Discord user ID
 */
function clearChatHistory(userId) {
    chatHistory.delete(userId);
}

module.exports = {
    sendMessage,
    clearChatHistory
}; 