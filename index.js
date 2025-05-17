process.env.YTDL_NO_UPDATE = 'true';
require('dotenv').config(); // 載入 .env 環境變數

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require("@distube/ytdl-core");
const { client: gachaClient, gacha } = require('./gacha.js');

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

// 定義 Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 播放 YouTube 音樂')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('YouTube 影片連結')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('controls')
        .setDescription('🎮 顯示音樂控制面板'),
    new SlashCommandBuilder()
        .setName('抽卡')
        .setDescription('🎲 進行抽卡')
].map(command => command.toJSON());

// 註冊 Slash Commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// 檢查是否需要註冊命令
async function checkAndRegisterCommands() {
    try {
        // 獲取當前註冊的命令
        const currentCommands = await rest.get(
            Routes.applicationCommands(client.user.id)
        );

        // 檢查命令是否有變更
        const needsUpdate = JSON.stringify(currentCommands) !== JSON.stringify(commands);

        if (needsUpdate) {
            console.log('檢測到命令變更，開始更新 Slash Commands...');
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );
            console.log(`成功更新 ${data.length} 個 Slash Commands！`);
            console.log('已註冊的命令：', data.map(cmd => cmd.name).join(', '));
        } else {
            console.log('Slash Commands 已是最新，無需更新。');
        }
    } catch (error) {
        console.error('檢查或更新 Slash Commands 時發生錯誤：', error);
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot 已上線: ${client.user.tag}`);
    await checkAndRegisterCommands();
});

// 處理 Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // 檢查是否在指定的音樂頻道
    const isMusicChannel = interaction.channelId === '1373294217425588335';
    // 檢查是否在指定的抽卡頻道
    const isGachaChannel = interaction.channelId === '1373289481804709978';

    if (interaction.commandName === '抽卡') {
        if (!isGachaChannel) {
            return interaction.reply({ 
                content: '❌ 抽卡指令只能在指定的抽卡頻道使用！',
                flags: [1 << 6]
            });
        }

        try {
            const result = await gacha(interaction.guild);
            await interaction.reply({ 
                content: result
            });
        } catch (error) {
            console.error('抽卡時發生錯誤：', error);
            await interaction.reply({ 
                content: '❌ 抽卡時發生錯誤，請稍後再試！',
                flags: [1 << 6]
            });
        }
    } else if (interaction.commandName === 'play') {
        if (!isMusicChannel) {
            return interaction.reply({ 
                content: '❌ 音樂指令只能在指定的音樂頻道使用！',
                flags: [1 << 6]
            });
        }

        const url = interaction.options.getString('url');
        if (!ytdl.validateURL(url)) {
            return interaction.reply({ 
                content: '請提供一個有效的 YouTube 連結！',
                flags: [1 << 6]
            });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ 
                content: '你必須先加入語音頻道！',
                flags: [1 << 6]
            });
        }

        // 先回應一個延遲訊息
        await interaction.deferReply();

        try {
            // 獲取影片資訊
            const info = await ytdl.getInfo(url);
            const videoTitle = info.videoDetails.title;
            const duration = formatDuration(info.videoDetails.lengthSeconds);

            // 取得或建立伺服器的佇列
            if (!queues.has(interaction.guildId)) {
                queues.set(interaction.guildId, {
                    songs: [],
                    connection: null,
                    player: createAudioPlayer()
                });
            }

            const queue = queues.get(interaction.guildId);

            // 如果是第一首歌，建立連接
            if (!queue.connection) {
                queue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                queue.connection.subscribe(queue.player);
            }

            // 將歌曲加入佇列
            queue.songs.push({
                url: url,
                title: videoTitle,
                duration: duration
            });

            // 創建嵌入訊息
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎵 已將歌曲加入播放清單！')
                .addFields(
                    { name: '歌曲', value: videoTitle },
                    { name: '時長', value: duration },
                    { name: '序列位置', value: `#${queue.songs.length}` }
                );

            // 創建按鈕
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('show_queue')
                        .setLabel('📋 查看播放序列')
                        .setStyle(ButtonStyle.Primary)
                );

            // 編輯延遲訊息
            await interaction.editReply({ 
                embeds: [embed], 
                components: [row]
            });

            // 如果佇列中只有一首歌，開始播放
            if (queue.songs.length === 1) {
                playNext(interaction.guildId);
            }

        } catch (error) {
            console.error('獲取影片資訊時發生錯誤：', error);
            await interaction.editReply({ 
                content: '❌ 無法獲取影片資訊，請稍後再試！'
            });
        }
    } else if (interaction.commandName === 'controls') {
        if (!isMusicChannel) {
            return interaction.reply({ 
                content: '❌ 音樂指令只能在指定的音樂頻道使用！',
                flags: [1 << 6]
            });
        }

        const queue = queues.get(interaction.guildId);
        if (!queue || !queue.player) {
            return interaction.reply({ 
                content: '目前沒有正在播放的音樂！',
                flags: [1 << 6]
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('skip')
                    .setLabel('⏭️ 跳過')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('pause')
                    .setLabel('⏸️ 暫停')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('resume')
                    .setLabel('▶️ 繼續')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ 
            content: '🎵 音樂控制面板', 
            components: [row],
            flags: [1 << 6]
        });
    }
});

// 處理按鈕點擊事件
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.player) {
        return interaction.reply({ 
            content: '目前沒有正在播放的音樂！', 
            flags: [1 << 6]
        });
    }

    if (interaction.customId === 'show_queue') {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 播放序列')
            .setDescription(queue.songs.map((song, index) => 
                `${index + 1}. ${song.title} (${song.duration})`
            ).join('\n'));

        await interaction.reply({ 
            embeds: [embed], 
            flags: [1 << 6]
        });
    } else if (interaction.customId === 'skip') {
        queue.player.stop();
        await interaction.reply({ 
            content: '⏭️ 已跳過當前歌曲', 
            flags: [1 << 6]
        });
    } else if (interaction.customId === 'pause') {
        if (queue.player.state.status === AudioPlayerStatus.Playing) {
            queue.player.pause();
            await interaction.reply({ 
                content: '⏸️ 已暫停播放', 
                flags: [1 << 6]
            });
        } else {
            await interaction.reply({ 
                content: '❌ 音樂已經暫停了', 
                flags: [1 << 6]
            });
        }
    } else if (interaction.customId === 'resume') {
        if (queue.player.state.status === AudioPlayerStatus.Paused) {
            queue.player.unpause();
            await interaction.reply({ 
                content: '▶️ 已繼續播放', 
                flags: [1 << 6]
            });
        } else {
            await interaction.reply({ 
                content: '❌ 音樂正在播放中', 
                flags: [1 << 6]
            });
        }
    }
});

// 格式化時間函數
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 播放下一首歌的函數
function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    const song = queue.songs[0];
    const stream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    });
    const resource = createAudioResource(stream, {
        inputType: 'arbitrary',
        inlineVolume: true
    });
    
    // 設置音量為 50%
    resource.volume.setVolume(0.5);
    
    queue.player.play(resource);

    // 添加播放狀態監聽
    queue.player.on(AudioPlayerStatus.Playing, () => {
        console.log('開始播放音樂');
    });

    queue.player.on(AudioPlayerStatus.Paused, () => {
        console.log('音樂已暫停');
    });

    queue.player.once(AudioPlayerStatus.Idle, () => {
        queue.songs.shift(); // 移除已播放的歌曲
        if (queue.songs.length > 0) {
            playNext(guildId); // 播放下一首
        }
    });

    queue.player.on('error', error => {
        console.error('📀 播放錯誤：', error.message);
    
        if (error.message.includes("Status code: 429")) {
            // 提示用戶稍後再試
            const channel = client.channels.cache.get(voiceChannel.id);
            if (channel) {
                channel.send('🚫 遭到 YouTube 限制，請稍後再試或使用不同連結。');
            }
        }
    
        queue.songs.shift();
        playNext(guildId); // 嘗試播放下一首
    });
}

// 登入 Discord
client.login(process.env.DISCORD_TOKEN);
gachaClient.login(process.env.DISCORD_TOKEN);