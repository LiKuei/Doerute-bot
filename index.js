process.env.YTDL_NO_UPDATE = 'true';
require('dotenv').config();

const express = require('express');
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

    try {
        // 獲取視頻信息
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;

        // 將歌曲加入佇列
        queue.songs.push({
            url: url,
            title: title
        });
        message.reply(`🎵 已將歌曲 **${title}** 加入播放佇列！`);

        // 如果佇列中只有一首歌，開始播放
        if (queue.songs.length === 1) {
            playNext(message.guild.id);
        }
    } catch (error) {
        console.error('處理歌曲錯誤:', error);
        if (error.message.includes('Status code: 403')) {
            message.reply('🚫 無法訪問該視頻，可能是因為視頻設定了年齡限制或地區限制。');
        } else {
            message.reply(`❌ 處理歌曲時發生錯誤: ${error.message}`);
        }
    }
});

// 播放下一首歌的函數
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    try {
        const song = queue.songs[0];
        console.log('開始播放:', song.title);

        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            },
            fmt: 'mp3',
            opusEncoded: false
        });

        const resource = createAudioResource(stream, {
            inputType: 'arbitrary',
            inlineVolume: true
        });

        resource.volume?.setVolume(1);
        queue.player.play(resource);

        // 處理流錯誤
        stream.on('error', error => {
            console.error('流錯誤:', error);
            queue.songs.shift();
            if (queue.songs.length > 0) {
                playNext(guildId);
            }
        });

        queue.player.once(AudioPlayerStatus.Idle, () => {
            queue.songs.shift(); // 移除已播放的歌曲
            if (queue.songs.length > 0) {
                playNext(guildId); // 播放下一首
            }
        });

        queue.player.on('error', error => {
            console.error('📀 播放錯誤：', error.message);
            
            if (error.message.includes("Status code: 403")) {
                const channel = client.channels.cache.get(queue.connection.joinConfig.channelId);
                if (channel) {
                    channel.send('🚫 無法播放該視頻，可能是因為視頻設定了年齡限制或地區限制。');
                }
            } else if (error.message.includes("Status code: 429")) {
                const channel = client.channels.cache.get(queue.connection.joinConfig.channelId);
                if (channel) {
                    channel.send('🚫 遭到 YouTube 限制，請稍後再試或使用不同連結。');
                }
            } else {
                const channel = client.channels.cache.get(queue.connection.joinConfig.channelId);
                if (channel) {
                    channel.send('❌ 播放時發生錯誤，嘗試播放下一首歌曲。');
                }
            }
            
            queue.songs.shift();
            if (queue.songs.length > 0) {
                playNext(guildId); // 嘗試播放下一首
            }
        });
    } catch (error) {
        console.error('播放錯誤:', error);
        queue.songs.shift();
        if (queue.songs.length > 0) {
            playNext(guildId);
        }
    }
}

// 登入 Discord
client.login(process.env.DISCORD_TOKEN);

// 建立 Express Web 服務，讓 Render 不會休眠
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => {
    console.log('🌐 Web service running to keep bot alive.');
});