require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let partnerCount = 0;
const verifiedUsers = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('인증')
        .setDescription('로블록스 계정을 연동하고 가상 주민번호를 발급받습니다.')
        .addStringOption(opt => opt.setName('로블록스닉네임').setDescription('본인의 로블록스 닉네임').setRequired(true)),
    new SlashCommandBuilder()
        .setName('티켓상태')
        .setDescription('티켓 처리 상태를 변경합니다.')
        .addStringOption(opt => opt.setName('상태').setDescription('대기중 / 처리중 / 완료').setRequired(true)
            .addChoices(
                { name: '🟡 대기중', value: '🟡 대기중' },
                { name: '🔵 처리중', value: '🔵 처리중' },
                { name: '🟢 완료', value: '🟢 완료' }
            )),
    new SlashCommandBuilder()
        .setName('재생')
        .setDescription('음성 채널에서 유튜브 노래를 재생합니다.')
        .addStringOption(opt => opt.setName('검색어').setDescription('노래 제목 또는 유튜브 링크').setRequired(true)),
    new SlashCommandBuilder()
        .setName('나가기')
        .setDescription('음성 채널에서 봇을 내보냅니다.')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`✅ RP 매니저 봇 로그인 완료: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ 슬래시 커맨드 등록 완료');
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === '인증') {
        const robloxName = interaction.options.getString('로블록스닉네임');
        const now = new Date();
        const year = String(now.getFullYear()).slice(-2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const virtualId = `${year}${month}${day}`;

        verifiedUsers.set(interaction.user.id, virtualId);

        try {
            const newNick = `시민-${robloxName} | (${virtualId})`;
            await interaction.member.setNickname(newNick);
        } catch (err) {
            console.log('권한 부족으로 서버 별명을 변경하지 못했습니다.');
        }

        try {
            await interaction.user.send(`[RP 매니저] 인증이 완료되었습니다.\n가상 주민등록 번호는 **${virtualId}** 입니다. 확인 부탁드립니다.`);
        } catch (e) {
            return interaction.reply({ content: '인증은 완료되었으나 DM 차단이 되어있어 가상 주민번호를 DM으로 보내지 못했습니다.', ephemeral: true });
        }

        await interaction.reply({ content: '✅ 인증 완료! DM으로 가상 주민번호가 발송되었으며 서버 닉네임이 변경되었습니다.', ephemeral: true });
    }

    else if (interaction.commandName === '티켓상태') {
        const status = interaction.options.getString('상태');
        const embed = new EmbedBuilder()
            .setColor(status.includes('완료') ? 0x2ECC71 : status.includes('처리') ? 0x3498DB : 0xF1C40F)
            .setTitle('🎫 티켓 처리 상태 변경')
            .setDescription(`현재 티켓 상태: **${status}**`)
            .setFooter({ text: `요청자: ${interaction.user.username}` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (interaction.commandName === '재생') {
        const query = interaction.options.getString('검색어');
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ 먼저 음성 채널에 입장해주세요!', ephemeral: true });

        await interaction.deferReply();
        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            const searchResult = await play.search(query, { limit: 1 });
            if (!searchResult.length) return interaction.editReply('❌ 검색 결과가 없습니다.');

            const songUrl = searchResult[0].url;
            const stream = await play.stream(songUrl);
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            const player = createAudioPlayer();

            connection.subscribe(player);
            player.play(resource);

            await interaction.editReply(`🎶 **[${searchResult[0].title}]** 재생을 시작합니다!`);
        } catch (e) {
            console.error(e);
            await interaction.editReply('❌ 노래를 재생하는 중 오류가 발생했습니다.');
        }
    }

    else if (interaction.commandName === '나가기') {
        const connection = require('@discordjs/voice').getVoiceConnection(interaction.guild.id);
        if (connection) {
            connection.destroy();
            await interaction.reply('👋 음성 채널에서 퇴장합니다.');
        } else {
            await interaction.reply({ content: '❌ 봇이 음성 채널에 없습니다.', ephemeral: true });
        }
    }
});

app.get('/api/channels', (req, res) => {
    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(channel => {
            if (channel.type === 0) channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
        });
    });
    res.json(channels);
});

app.post('/api/announce', async (req, res) => {
    const { password, channelId, title, description, mention } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: '비밀번호 오류' });

    try {
        const channel = await client.channels.fetch(channelId);
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x3b82f6).setTimestamp();
        await channel.send({ content: mention === 'everyone' ? '@everyone' : mention === 'here' ? '@here' : '', embeds: [embed] });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: '전송 실패' }); }
});

app.post('/api/partner', async (req, res) => {
    const { password, channelId, intro, mention } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: '비밀번호 오류' });

    partnerCount++;
    try {
        const channel = await client.channels.fetch(channelId);
        const embed = new EmbedBuilder()
            .setTitle(`🤝 제 ${partnerCount}호 파트너 체결`)
            .setDescription(intro)
            .setColor(0xEC4899)
            .setTimestamp();
        await channel.send({ content: mention ? '@everyone' : '', embeds: [embed] });
        res.json({ success: true, count: partnerCount });
    } catch (e) { res.status(500).json({ error: '전송 실패' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 웹 서버 실행 중: 포트 ${PORT}`));
client.login("MTU3MTQ0DQyNtc3NTk5NzAxMA.GLE8Ga.hHvqUWG0a9duBKPiNXzEkL01-nxosSvxVvtWLk");
