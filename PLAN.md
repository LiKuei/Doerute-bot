# 修復 YouTube 播放功能計畫

## 任務目標

修復 Discord bot 在輸入 `/play url` 後沒有聲音播出的問題，並盡量保留目前接本機 AI 模型的改動。

## 執行步驟

- [x] 檢查目前 repo 狀態與相關檔案。
- [x] 比對目前 `index.js` 與舊版 `index_old.js` 的播放流程差異。
- [x] 找出播放失敗原因並小範圍修正。
- [x] 執行必要的語法或靜態檢查。
- [x] 整理修改內容、測試結果與需要 Kuei 實測的項目。
- [x] 移除第二個 Discord client 登入，避免語音 gateway 狀態被分流。
- [x] 更新 `@discordjs/voice` 至新版，改善 Node 24 與 Discord voice 連線相容性。

## 完成條件

- `/play url` 的語音連線與音訊播放流程恢復可用。
- 不任意覆寫 AI 模型相關實作或其他未提交變更。
- 提供清楚的測試方式與建議 commit 訊息。
