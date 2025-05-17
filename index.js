require('dotenv').config(); // 載入 .env 環境變數

const express = require('express'); // 保持 Render 活著用
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require("@distube/ytdl-core");

// 建立 Discord Bot Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// 建立一個 Map 來儲存每個伺服器的播放佇列
const queues = new Map();

client.once('ready', () => {
    console.log(`🤖 Bot 已上線: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!play') || message.author.bot) return;

    const args = message.content.split(' ');
    const url = args[1];
    if (!url || !ytdl.validateURL(url)) {
        return message.reply('請提供一個有效的 YouTube 連結！');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('你必須先加入語音頻道！');

    // 取得或建立伺服器的佇列
    if (!queues.has(message.guild.id)) {
        queues.set(message.guild.id, {
            songs: [],
            connection: null,
            player: createAudioPlayer()
        });
    }

    const queue = queues.get(message.guild.id);

    // 如果是第一首歌，建立連接
    if (!queue.connection) {
        queue.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });
        queue.connection.subscribe(queue.player);
    }

    // 將歌曲加入佇列
    queue.songs.push(url);
    message.reply('🎵 已將歌曲加入播放佇列！');

    // 如果佇列中只有一首歌，開始播放
    if (queue.songs.length === 1) {
        playNext(message.guild.id);
    }
});

// 播放下一首歌的函數
function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    const url = queue.songs[0];
    const stream = ytdl(url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    });
    const resource = createAudioResource(stream);
    
    queue.player.play(resource);

    queue.player.once(AudioPlayerStatus.Idle, () => {
        queue.songs.shift(); // 移除已播放的歌曲
        if (queue.songs.length > 0) {
            playNext(guildId); // 播放下一首
        }
    });

    queue.player.on('error', error => {
        console.error('📀 播放錯誤：', error.message);
        queue.songs.shift();
        playNext(guildId); // 嘗試播放下一首
    });
}

// 登入 Discord
client.login(process.env.DISCORD_TOKEN);

// 建立 Express Web 服務，讓 Render 不會休眠
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => {
    console.log('🌐 Web service running to keep bot alive.');
});
