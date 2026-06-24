process.env.YTDL_NO_UPDATE = 'true';
require('dotenv').config(); // 載入 .env 環境變數

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const { gacha } = require('./gacha.js');
const { sendMessage, clearChatHistory } = require('./ollama.js');

function getYtDlpPath() {
    return path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
}

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(getYtDlpPath(), args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => {
            stdout += chunk;
        });

        proc.stderr.on('data', chunk => {
            stderr += chunk;
        });

        proc.on('error', reject);
        proc.on('close', code => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp 執行失敗 (${code})：${stderr.trim().slice(-300)}`));
            }
            resolve(stdout.trim());
        });
    });
}

async function getYoutubeVideoInfo(url) {
    const output = await runYtDlp([url, '--dump-json', '--no-playlist', '--no-warnings']);
    const meta = JSON.parse(output);

    return {
        title: meta.title || '未知標題',
        durationSeconds: meta.duration || 0
    };
}

async function getYoutubeStreamUrl(url) {
    return runYtDlp([
        url,
        '--get-url',
        '--format',
        'bestaudio[ext=webm]/bestaudio',
        '--no-playlist',
        '--no-warnings'
    ]);
}

function validateYoutubeURL(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
}

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

// 處理 Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // 檢查是否在指定的音樂頻道
    const isMusicChannel = interaction.channelId === '1373294217425588335';
    // 檢查是否在指定的抽卡頻道
    const isGachaChannel = interaction.channelId === '1373289481804709978';

    if (interaction.commandName === 'clear_chat') {
        const clearId = interaction.channel.isThread() ? interaction.channelId : interaction.user.id;
        clearChatHistory(clearId);
        await interaction.reply({
            content: '🧹 已清除當前對話歷史！',
            flags: [1 << 6]
        });
    } else if (interaction.commandName === '抽卡') {
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
        // if (!isMusicChannel) {
        //     return interaction.reply({
        //         content: '❌ 音樂指令只能在指定的音樂頻道使用！',
        //         flags: [1 << 6]
        //     });
        // }

        const url = interaction.options.getString('url');
        if (!validateYoutubeURL(url)) {
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
            const info = await getYoutubeVideoInfo(url);
            const videoTitle = info.title;
            const duration = formatDuration(info.durationSeconds);

            // 取得或建立伺服器的佇列
            const queue = getOrCreateQueue(interaction);

            // 如果是第一首歌，建立連接
            if (!queue.connection) {
                queue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                });

                queue.connection.on('stateChange', (oldState, newState) => {
                    console.log(`[Voice] Guild ${interaction.guildId} ${oldState.status} -> ${newState.status}`);
                    if (newState.status === VoiceConnectionStatus.Ready) {
                        console.log(`[Voice] Guild ${interaction.guildId} Connection Ready!`);
                    }
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
    } else if (interaction.commandName === 'join') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ 你必須先加入語音頻道！',
                flags: [1 << 6]
            });
        }

        try {
            // 取得或建立伺服器的佇列
            const queue = getOrCreateQueue(interaction);

            // 如果已經在語音頻道中，先斷開連接
            if (queue.connection) {
                queue.connection.destroy();
            }

            // 建立新的連接
            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });
            queue.connection.subscribe(queue.player);

            await interaction.reply({
                content: `✅ 已加入語音頻道：${voiceChannel.name}`,
                flags: [1 << 6]
            });
        } catch (error) {
            console.error('加入語音頻道時發生錯誤：', error);
            await interaction.reply({
                content: '❌ 加入語音頻道時發生錯誤，請稍後再試！',
                flags: [1 << 6]
            });
        }
    } else if (interaction.commandName === 'leave') {
        const queue = queues.get(interaction.guildId);
        if (!queue || !queue.connection) {
            return interaction.reply({
                content: '❌ 機器人目前不在任何語音頻道中！',
                flags: [1 << 6]
            });
        }

        try {
            // 停止播放器
            queue.player.stop();
            // 斷開連接
            queue.connection.destroy();
            // 清除閒置計時器
            if (queue.idleTimeout) {
                clearTimeout(queue.idleTimeout);
            }
            // 清除佇列
            queues.delete(interaction.guildId);

            await interaction.reply({
                content: '👋 已退出語音頻道！',
                flags: [1 << 6]
            });
        } catch (error) {
            console.error('退出語音頻道時發生錯誤：', error);
            await interaction.reply({
                content: '❌ 退出語音頻道時發生錯誤，請稍後再試！',
                flags: [1 << 6]
            });
        }
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

// 建立或取得伺服器音樂佇列的輔助函數
function getOrCreateQueue(interaction) {
    let queue = queues.get(interaction.guildId);
    if (!queue) {
        queue = {
            songs: [],
            connection: null,
            player: createAudioPlayer(),
            textChannel: interaction.channel,
            idleTimeout: null
        };
        queues.set(interaction.guildId, queue);
        setupPlayerListeners(queue, interaction.guildId);
    } else {
        // 更新為最新的文字頻道，以利狀態訊息能發送在正確頻道
        queue.textChannel = interaction.channel;
    }
    return queue;
}

// 設定音樂播放器的監聽器（只在 Player 建立時設定一次，避免重複註冊導致記憶體洩漏與重複輸出）
function setupPlayerListeners(queue, guildId) {
    queue.player.on(AudioPlayerStatus.Playing, () => {
        console.log(`[Music] Guild ${guildId} 開始播放音樂`);
    });

    queue.player.on(AudioPlayerStatus.Paused, () => {
        console.log(`[Music] Guild ${guildId} 音樂已暫停`);
    });

    queue.player.on(AudioPlayerStatus.Idle, () => {
        // 移除已播放完畢的歌
        queue.songs.shift();

        if (queue.songs.length > 0) {
            playNext(guildId); // 播放下一首
        } else {
            console.log(`[Music] Guild ${guildId} 播放清單已空，啟動 5 分鐘閒置計時器`);
            // 佇列空了，設定 5 分鐘後自動退出頻道
            queue.idleTimeout = setTimeout(() => {
                const currentQueue = queues.get(guildId);
                if (currentQueue && currentQueue.connection) {
                    currentQueue.connection.destroy();
                    queues.delete(guildId);
                    if (currentQueue.textChannel) {
                        currentQueue.textChannel.send('👋 閒置時間過長，已自動退出語音頻道。');
                    }
                }
            }, 300000); // 5 分鐘
        }
    });

    queue.player.on('error', error => {
        console.error(`[Music] Guild ${guildId} 播放錯誤：`, error.message);

        if (queue.textChannel) {
            if (error.message.includes("Status code: 429")) {
                queue.textChannel.send('🚫 遭到 YouTube 限制 (429)，請稍後再試或使用不同連結。');
            } else {
                queue.textChannel.send(`❌ 播放歌曲時發生錯誤：${error.message}`);
            }
        }

        // 遇到錯誤，移除該首並嘗試播下一首
        queue.songs.shift();
        playNext(guildId);
    });
}

// 播放下一首歌的函數
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    // 若有閒置計時器，清除它
    if (queue.idleTimeout) {
        clearTimeout(queue.idleTimeout);
        queue.idleTimeout = null;
    }

    const song = queue.songs[0];

    try {
        if (!queue.connection) {
            throw new Error('尚未建立語音連線，請先讓 bot 加入語音頻道。');
        }

        if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Ready) {
            try {
                await entersState(queue.connection, VoiceConnectionStatus.Ready, 20000);
            } catch (error) {
                console.warn(`[Voice] Guild ${guildId} 語音連線尚未 Ready：${error.message}`);
                try {
                    queue.connection.destroy();
                } catch (destroyError) {
                    console.warn(`[Voice] Guild ${guildId} 清理語音連線失敗：${destroyError.message}`);
                }
                queue.connection = null;
                throw new Error('語音連線逾時，請確認 bot 有連線與說話權限後再試一次。');
            }
        }

        const streamUrl = await getYoutubeStreamUrl(song.url);

        const resource = createAudioResource(streamUrl, {
            inlineVolume: true,
            silencePaddingFrames: 0
        });

        resource.volume.setVolume(0.5);
        queue.player.play(resource);

        if (queue.textChannel) {
            queue.textChannel.send(`🎶 **現在播放：** ${song.title} (${song.duration})`);
        }

    } catch (error) {
        console.error(`[Music] Guild ${guildId} 播放準備出錯:`, error.message);
        if (queue.textChannel) {
            queue.textChannel.send(`❌ 無法播放歌曲 **${song.title}**，已自動跳過。原因：${error.message}`);
        }
        queue.songs.shift();
        playNext(guildId);
    }
}


// 處理訊息事件以進行 AI 對話 (透過 @提及 啟動討論串，並在討論串中持續對話)
client.on('messageCreate', async message => {
    // 忽略機器人發送的訊息
    if (message.author.bot) return;

    // 檢查目前訊息是否在討論串 (Thread) 中
    const isThread = message.channel.isThread();

    let shouldRespond = false;
    let isNewConversation = false;

    if (isThread) {
        // 如果在討論串中，且該討論串是機器人創立的，或者機器人在裡面被 ping，就進行回覆
        if (message.channel.ownerId === client.user.id) {
            shouldRespond = true;
        } else if (message.mentions.has(client.user.id) && !message.mentions.everyone) {
            shouldRespond = true;
        }
    } else {
        // 如果在一般頻道中，只有當被 @ 提及時才開啟新對話（討論串）
        const isMentioned = message.mentions.has(client.user.id) && !message.mentions.everyone;
        if (isMentioned) {
            shouldRespond = true;
            isNewConversation = true;
        }
    }

    if (!shouldRespond) return;

    // 取得使用者輸入的內容，並移除機器人的提及標籤
    let prompt = message.content;
    const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    prompt = prompt.replace(mentionRegex, '').trim();

    // 決定使用哪個 ID 來追蹤對話歷史
    // 如果是討論串，我們使用 threadId (message.channel.id) 追蹤，使討論串內的角色與脈絡獨立
    // 如果不是，先暫用 userId (message.author.id)
    let chatSessionId = isThread ? message.channel.id : message.author.id;

    // 如果是指令 "清除" 或 "clear"，清除該對話歷史紀錄
    if (prompt.toLowerCase() === 'clear' || prompt === '清除') {
        clearChatHistory(chatSessionId);
        return message.reply('🧹 已成功清除當前主題的對話歷史紀錄！');
    }

    // 如果只提及了機器人但沒有輸入其他內容
    if (!prompt) {
        if (!isThread && message.mentions.has(client.user.id)) {
            return message.reply('找我嗎？有什麼我可以幫忙的？');
        }
        return;
    }

    try {
        let targetChannel = message.channel;

        // 如果是新對話且不在討論串中，我們主動建立一個討論串
        if (isNewConversation) {
            // 清理提問內容中的 Discord 特殊標籤（如 @提及、#頻道、自訂表情），避免討論串名稱顯示原始 ID 標記
            const cleanNamePrompt = prompt
                .replace(/<@!?\d+>/g, '') // 移除用戶提及
                .replace(/<@&\d+>/g, '')  // 移除身分組提及
                .replace(/<#\d+>/g, '')   // 移除頻道連結
                .replace(/<a?:\w+:\d+>/g, '') // 移除自訂表情符號
                .replace(/\s+/g, ' ')     // 整理多餘空格
                .trim();

            const displayName = cleanNamePrompt || '聊天對話';
            const threadName = `💬 AI對話 - ${displayName.substring(0, 20)}${displayName.length > 20 ? '...' : ''}`;

            // 在原訊息下建立一個討論串
            const thread = await message.startThread({
                name: threadName,
                autoArchiveDuration: 60, // 60 分鐘沒人發言就自動封存
                reason: '與 AI 對話的討論串'
            });

            targetChannel = thread;
            chatSessionId = thread.id; // 新對話的 Session ID 設為該討論串 ID
        }

        let replyMessage;

        // 建立初始的「思考中」訊息
        if (isNewConversation) {
            replyMessage = await targetChannel.send('朵爾忒正在思考中……');
        } else {
            replyMessage = await message.reply({
                content: '朵爾忒正在思考中……',
                allowedMentions: { repliedUser: true }
            });
        }

        // 獲取 AI 的回應 (使用 chatSessionId 作為對話識別碼，並透過 progress callback 串流更新訊息)
        const response = await sendMessage(chatSessionId, message.author.id, prompt, (currentText) => {
            replyMessage.edit({ content: currentText }).catch(console.error);
        });

        // 結束後，更新為最終且完整的內容
        await replyMessage.edit({ content: response }).catch(console.error);
    } catch (error) {
        console.error('訊息聊天時發生錯誤：', error);
        const errMsg = '❌ 抱歉，我現在處理您的訊息時遇到了錯誤，請稍後再試！';
        if (replyMessage) {
            await replyMessage.edit({ content: errMsg }).catch(console.error);
        } else {
            await message.reply(errMsg).catch(console.error);
        }
    }
});

// 當討論串被封存或刪除時，自動清除記憶體中的對話歷史，防止記憶體洩漏
client.on('threadUpdate', (oldThread, newThread) => {
    if (newThread.archived && !oldThread.archived) {
        clearChatHistory(newThread.id);
        console.log(`[AI Chat] 討論串 ${newThread.id} 已被封存，已自動清除對話歷史。`);
    }
});

client.on('threadDelete', thread => {
    clearChatHistory(thread.id);
    console.log(`[AI Chat] 討論串 ${thread.id} 已被刪除，已自動清除對話歷史。`);
});

// 登入 Discord
client.login(process.env.DISCORD_TOKEN);
