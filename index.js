require('dotenv').config();
client.login(process.env.DISCORD_TOKEN);
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require("@distube/ytdl-core");
require('dotenv').config();

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
        quality: 'highestaudio', // 也可以試試 'lowestaudio'
        highWaterMark: 1 << 25    // 增加 buffer，避免中斷
      });
    const resource = createAudioResource(stream);
    
    queue.player.play(resource);
    queue.player.on('error', error => {
        console.error('📀 播放錯誤：', error.message);
        queue.songs.shift();
        playNext(guildId); // 嘗試播放下一首
      });
    // 當歌曲播放結束時
    queue.player.once(AudioPlayerStatus.Idle, () => {
        queue.songs.shift(); // 移除已播放的歌曲
        if (queue.songs.length > 0) {
            // 如果佇列中還有歌曲，播放下一首
            playNext(guildId);
        }
    });
}

client.login(process.env.DISCORD_TOKEN);

// index.js 的最下面加入
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => {
  console.log('Web service alive to keep Render happy.');
});
