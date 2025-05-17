const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// 表情符號的機率設定
const EMOTE_PROBABILITIES = {
    'Gayge': 0.05,  // 5%
    'Okayge': 0.10, // 10%
    'KEKW': 0.85    // 85%
};

// 確保至少有一個 Okayge 的函數
function generateGachaResults() {
    const results = [];
    let hasOkayge = false;
    
    // 生成前9個結果
    for (let i = 0; i < 9; i++) {
        const random = Math.random();
        let emote;
        
        if (random < EMOTE_PROBABILITIES.Gayge) {
            emote = 'Gayge';
        } else if (random < EMOTE_PROBABILITIES.Gayge + EMOTE_PROBABILITIES.Okayge) {
            emote = 'Okayge';
            hasOkayge = true;
        } else {
            emote = 'KEKW';
        }
        
        results.push(emote);
    }
    
    // 如果前9個沒有 Okayge，第10個必定是 Okayge
    if (!hasOkayge) {
        results.push('Okayge');
    } else {
        // 如果已經有 Okayge，第10個隨機生成
        const random = Math.random();
        if (random < EMOTE_PROBABILITIES.Gayge) {
            results.push('Gayge');
        } else if (random < EMOTE_PROBABILITIES.Gayge + EMOTE_PROBABILITIES.Okayge) {
            results.push('Okayge');
        } else {
            results.push('KEKW');
        }
    }
    
    return results;
}

// 抽卡函數
async function gacha(guild) {
    try {
        // 獲取伺服器的表情符號
        await guild.emojis.fetch();
        
        // 檢查所需的表情符號是否存在
        const gaygeEmote = guild.emojis.cache.find(emoji => emoji.name === 'Gayge');
        const okaygeEmote = guild.emojis.cache.find(emoji => emoji.name === 'Okayge');
        const kekwEmote = guild.emojis.cache.find(emoji => emoji.name === 'KEKW');
        
        if (!gaygeEmote || !okaygeEmote || !kekwEmote) {
            return '❌ 伺服器中缺少必要的表情符號！';
        }
        
        // 生成抽卡結果
        const results = generateGachaResults();
        
        // 將結果轉換為表情符號
        const emoteResults = results.map(emote => {
            switch(emote) {
                case 'Gayge': return gaygeEmote.toString();
                case 'Okayge': return okaygeEmote.toString();
                case 'KEKW': return kekwEmote.toString();
            }
        });
        
        // 創建回應訊息
        return [
            '🎲 抽卡結果：',
            emoteResults.join(' ')
        ].join('\n');
        
    } catch (error) {
        console.error('抽卡時發生錯誤：', error);
        return '❌ 抽卡時發生錯誤，請稍後再試！';
    }
}

// 導出 client 和 gacha 函數供主程序使用
module.exports = { client, gacha }; 