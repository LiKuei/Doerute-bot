# 朵爾忒 (Doerute Bot)

這是一個基於 **Discord.js v14** 開發的自用 Discord 機器人，整合了 **Ollama 本地 LLM 對話**、**YouTube 音樂播放**與**自訂抽卡**等功能。

---

## 🌟 核心功能

### 🤖 本地 AI 對話 (Ollama 整合)
* **本地模型介接**：可自由介接本地端運行的 Ollama 模型（目前為Qwen 3.5 4b）。
* **討論串 (Thread) 對話模式**：在一般頻道中對機器人發送 `@提及`，機器人會以該問題自動建立一個專屬討論串。在討論串中聊天**不需**重複提及機器人，提供流暢的對話體驗。
* **思考模式 (Think Mode) 支援**：若使用具備思維鏈的模型（如 Qwen 思考模型），機器人會自動將 `<think>` 過程用 Discord 隱藏防雷標籤 (`||`) 包裹起來，避免洗版與字數溢出。
* **Context 記憶限制**：每個討論串獨立記憶最近的 20 筆對話，防範 Context 膨脹。
* **防記憶體洩漏機制**：當討論串被 Discord 封存 (Archived) 或刪除時，自動釋放該對話在 Node.js 記憶體中的快取，防止機器人長時間運作產生 memory leak。
* **身份識別語氣**：可根據使用者 Discord ID 給予客製化對話態度（如專屬助理語氣與一般有禮貌語氣）。

### 🎵 音樂播放功能
* **YouTube 音樂播放**：支援 YouTube 連結串流播放。
* **播放控制面板**：提供實體按鈕控制面板（播放、暫停、跳過、查看佇列）。

### 🎲 抽卡模組
* 於指定頻道中使用，支援客製化權重與隨機抽卡功能。

---

## 🛠️ 開發環境與安裝

### 需求
* **Node.js** >= 22.15.1 (使用原生全域 `fetch` 串接 API，無需額外安裝 SDK)。
* **FFmpeg** (音樂播放模組需要)。
* 本地運行的 **Ollama** 服務。

### 步驟

1. **複製專案並安裝套件**
   ```bash
   git clone https://github.com/LiKuei/Doerute-bot.git
   cd Doerute-bot
   npm install
   ```

2. **設定環境變數**
   複製 `.env.example` 並重新命名為 `.env`，填入相關 Token 與設定：
   ```ini
   DISCORD_TOKEN=你的_DISCORD_BOT_TOKEN
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=qwen2.5:3b  # 替換成你本地運行的 Ollama 模型名稱
   ```

3. **啟動 Bot**
   ```bash
   npm start
   ```

---

## 🎮 指令說明

### 斜線指令 (Slash Commands)
* `/play <url>` - 🎵 播放 YouTube 影片音訊。
* `/controls` - 🎮 喚出音樂控制面板（跳過、暫停、繼續）。
* `/join` - 🎤 讓機器人加入你當前的語音頻道。
* `/leave` - 👋 讓機器人退出語音頻道並清除播放佇列。
* `/clear_chat` - 🧹 手動清除當前對話歷史紀錄。
* `/抽卡` - 🎲 在指定抽卡頻道進行抽卡。

### 文字對話指令
* 在任何文字頻道中 **`@朵爾忒 <你的問題>`**：啟動一個新的討論串對話。
* 在對話討論串中打字：直接輸入即可繼續對話。
* 在對話討論串中輸入 **`清除`** 或 **`clear`**：手動重設該主題的歷史記憶。

---

## 📂 專案結構
* `index.js` - 機器人主入口程式，負責 Discord 互動、事件監聽與音樂播放邏輯。
* `ollama.js` - 本地 Ollama API 對話處理模組與 Context 快取維護。
* `gacha.js` - 抽卡功能邏輯模組。
