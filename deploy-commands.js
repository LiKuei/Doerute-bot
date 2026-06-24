require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 播放 YouTube 音樂或匯入播放清單')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube 影片或播放清單連結')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('controls')
        .setDescription('🎮 顯示音樂控制面板'),
    new SlashCommandBuilder()
        .setName('抽卡')
        .setDescription('🎲 進行抽卡'),
    new SlashCommandBuilder()
        .setName('clear_chat')
        .setDescription('🧹 清除與 AI 的對話歷史'),
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('🎤 加入語音頻道'),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('👋 退出語音頻道')
].map(command => command.toJSON());

if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN is missing in .env');
    process.exit(1);
}

// 從 Token 中解出 Client ID
const clientId = Buffer.from(process.env.DISCORD_TOKEN.split('.')[0], 'base64').toString('utf-8');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`開始註冊 ${commands.length} 個應用程式 (/) 指令...`);

        // 註冊為全域指令
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log(`成功註冊了 ${data.length} 個應用程式 (/) 指令！`);
    } catch (error) {
        console.error('註冊指令時發生錯誤:', error);
    }
})();
