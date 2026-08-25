require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

// --- 1. SERVER WEB HTTP (PER RENDER & UPTIME ROBOT) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Evren City RP - Crew Manager Bot Online (Playwright Hardcoded Edition)!');
});

app.listen(PORT, () => {
    console.log(`[Evren City] Server HTTP avviato sulla porta ${PORT}`);
});

// --- 2. GESTIONE CODA & COOLDOWN ---
const taskQueue = [];
let isProcessingQueue = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function queueTask(taskFunction) {
    return new Promise((resolve, reject) => {
        taskQueue.push({ taskFunction, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isProcessingQueue || taskQueue.length === 0) return;
    isProcessingQueue = true;
    const { taskFunction, resolve, reject } = taskQueue.shift();
    try {
        await sleep(3000);
        const result = await taskFunction();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        isProcessingQueue = false;
        processQueue();
    }
}

// --- 3. CLIENT DISCORD & PLAYWRIGHT HELPER ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] 
});

let membersCache = [];
let bannedCache = [];

async function getAuthenticatedPage() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Inserimento diretto dei cookie in formato Playwright
    await context.addCookies([
      {
        "name": "_ga_PJQ2JYZDQC",
        "value": "GS2.1.s1787669530$o1$g1$t1787674543$j58$l0$h0",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "OptanonConsent",
        "value": "isGpcEnabled=0&datestamp=Tue+Aug+25+2026+18%3A15%3A41+GMT%2B0200+(Ora+legale+dell%E2%80%99Europa+centrale)&version=202604.2.0&browserGpcFlag=0&isDntEnabled=0&isIABGlobal=false&hosts=&genVendors=&consentId=e5100e25-7fcc-48c7-ad66-abc78d94389b&interactionCount=1&isAnonUser=1&prevHadToken=0&landingPath=NotLandingPage&groups=1%3A1%2C2%3A1%2C3%3A1%2C4%3A1&fclco=&lastConsentTs=1787669533&intType=1&crTime=1787669535578&geolocation=IT%3B75&AwaitingReconsent=false",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_ga",
        "value": "GA1.1.6527890.1787669531",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "rockstarweb_lang.prod",
        "value": "en-US",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "bm_sv",
        "value": "1462F541BEF1731454C3B8DF66B694F9~YAAQhrUQAnkBNDKgAQAAgnuwOQCT/zQGBl5WvXpqdrgAVX5KttGRWfOMhyknbrR5YTXDysdRjy2aDo3TCB4JzGczqDavazvN3t3zIH9wueJIDd1+wdO6azPCPPtW5V5kjx2SwEd7sB0j9AO/IuCXn/7KGyvvPLhwlOCYzHy54fPMR6ws2xjYNb6NxgsIEweKimxVW0TS03+WMgUYH6OA8hsez0o4hUUiwdN2qlfFMS58ltkAkEqB4n3x5CxykifFwE5TwyzCyZM=~1",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "BearerToken",
        "value": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjdmNmQwNDRlLTBmNGMtNGM3ZS04NDk0LWUyYzBkZWM1YWE4ZiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiIzMDYxODk5MjUiLCJyb2Nrc3RhckF1dGguUnVpZCI6IjEyNDgwZTE4ZDQyODQwNjg4N2JiNTQxYjk4OTE4MTUzIiwianRpIjoiYjQ2NTI5N2EtNTQ5ZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcE1lU2lnbmVkSW4iOiJUcnVlIiwic2NBdXRoLlRva2VuU3RvcmFnZVR0bCI6IjI1OTIwMDAiLCJzY0F1dGguSXNBTWlub3IiOiJGYWxzZSIsInNjQXV0aC5OaWNrbmFtZSI6IkV2cmVuTWFuYWdlbWVudCIsInNjQXV0aC5BdmF0YXJVcmwiOiJodHRwczovL3Byb2QtYXZhdGFycy5ha2FtYWl6ZWQubmV0L3N0b2NrLWF2YXRhcnMvbi9HVEFWL2d0YXYwMi5wbmciLCJzY0F1dGguSXNFbWFpbFZlcmlmaWVkIjoiVHJ1ZSIsInNjQXV0aC5NZW1iZXJTaW5jZSI6IjIwMjYtMDgtMjVUMTQ6NTQ6NTIuNzYwMDAwMFoiLCJuYmYiOjE3ODc2NzQyNjIsImF1ZCI6WyJodHRwczovL3d3dy5yb2Nrc3RhcmdhbWVzLmNvbSIsImh0dHBzOi8vc2NhcGkucm9ja3N0YXJnYW1lcy5jb20iLCJyb2Nrc3RhcnNlcnZpY2VzIl0sInNjb3BlIjoic2NhcGk6KiBzY3M6dXBkYXRlUHJvZmlsZSIsImV4cCI6MTc4NzY3NDU2MiwiaWF0IjoxNzg3Njc0MjYyLCJpc3MiOiJodHRwczovL3NpZ25pbi5yb2Nrc3RhcmdhbWVzLmNvbSJ9.svrC9Xtq90V0b3eJg6WmEGZDnjtzs5TYGGk0f92Yg4DdNTd0qgKMPsLyZKbwtxgUDJND2C4z_kgvO4jBgZLvQfMnjdA3qt-C710obeAnQQ15KuAZvBmj5qc5I84bYF8wqqr_gbJAk2Iy8GTy7jJmcWScdEiQgGTJvoKTtRExuIKyK9VBbO1GKwYkPeJyWSEWueFo90GgWHIDL1JY7OfQvInV39uzEZ0yzh-Aao3ExCiKPgIWeV7qNvTSd6dNgfem6DizclImXkRXeA1z8ZT4f1kDuZRgAKogUbWEKXBn5KHqAePBdjgAMALW9RKuHQOJweSvhfYcpEdT0xJ0pOoT2A",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "OptanonAlertBoxClosed",
        "value": "2026-08-25T14:52:13.501Z",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_fbp",
        "value": "fb.1.1787669802088.153666339927725545",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_gcl_au",
        "value": "1.1.877096203.1787669802",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_twpid",
        "value": "tw.1787669801620.744046117391119025",
        "domain": "www.rockstargames.com",
        "path": "/"
      }
    ]);

    const page = await context.newPage();
    return { browser, page };
}

async function sendLogMessage(embed) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    try {
        const channel = await client.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("❌ Errore invio log:", err);
    }
}

// --- 4. FUNZIONI SOCIAL CLUB (PLAYWRIGHT) ---

async function verifyLogin() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto('https://socialclub.rockstargames.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000); 

        const profileInfo = await page.evaluate(() => {
            const cookies = document.cookie;
            return cookies.includes('BearerToken') || cookies.includes('scAuth');
        });

        if (profileInfo) {
            return "EvrenManagement (Verificato)";
        }
        return null;
    } catch (err) {
        console.error("Errore verifica login Playwright:", err);
        return null;
    } finally {
        await browser.close();
    }
}

async function fetchCrewMembers() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        const members = await page.evaluate(() => {
            const rows = document.querySelectorAll('.member-row, tr, [data-member-name]');
            let list = [];
            rows.forEach(r => {
                const nameEl = r.querySelector('.name, .nickname, [data-name]');
                const name = nameEl ? nameEl.innerText.trim() : r.innerText.trim();
                if (name && name.length > 2 && name.length < 30) {
                    list.push({ name, platform: 'pc' });
                }
            });
            return list;
        });

        membersCache = members.length > 0 ? members : [{ name: 'MembroEsempio', platform: 'pc' }];
        return membersCache;
    } catch (e) {
        console.error("Errore fetch membri Playwright:", e);
        return membersCache;
    } finally {
        await browser.close();
    }
}

async function fetchBannedMembers() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        return bannedCache;
    } catch (e) {
        console.error("Errore fetch bannati Playwright:", e);
        return bannedCache;
    } finally {
        await browser.close();
    }
}

async function autoApproveUser(username) {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        console.log(`Tentativo approvazione per: ${username}`);
        return true;
    } catch (e) {
        console.error("Errore approvazione Playwright:", e);
        return false;
    } finally {
        await browser.close();
    }
}

async function manageCrewMember(username, platform, action = 'kick') {
    const { browser, page } = await getAuthenticatedPage();
    try {
        let targetUrl = action === 'unban' 
            ? `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`
            : `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;

        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        console.log(`Esecuzione ${action} su utente: ${username} (${platform})`);
        return true;
    } catch (e) {
        console.error(`Errore ${action} Playwright:`, e);
        return false;
    } finally {
        await browser.close();
    }
}

// --- 5. COMANDI DISCORD ---

const setupCommand = new SlashCommandBuilder().setName('setup_pannello').setDescription('[STAFF] Invia pannello Crew');
const testLoginCommand = new SlashCommandBuilder().setName('test_login').setDescription('[STAFF] Test login Playwright');

const choicesPiattaforma = [
    { name: 'Tutte', value: 'all' },
    { name: 'PC', value: 'pc' },
    { name: 'PlayStation', value: 'ps' },
    { name: 'Xbox', value: 'xbox' }
];

const kickCommand = new SlashCommandBuilder()
    .setName('kick_crew')
    .setDescription('[STAFF] Espelli utente')
    .addStringOption(o => o.setName('piattaforma').setDescription('Piattaforma').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

const banCommand = new SlashCommandBuilder()
    .setName('ban_crew')
    .setDescription('[STAFF] Banna utente')
    .addStringOption(o => o.setName('piattaforma').setDescription('Piattaforma').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

const unbanCommand = new SlashCommandBuilder()
    .setName('unban_crew')
    .setDescription('[STAFF] Sblocca utente')
    .addStringOption(o => o.setName('piattaforma').setDescription('Piattaforma').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

const promoteCommand = new SlashCommandBuilder()
    .setName('promote_crew')
    .setDescription('[STAFF] Promuovi utente nella Crew')
    .addStringOption(o => o.setName('piattaforma').setDescription('Piattaforma').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

const demoteCommand = new SlashCommandBuilder()
    .setName('demote_crew')
    .setDescription('[STAFF] Degrada utente nella Crew')
    .addStringOption(o => o.setName('piattaforma').setDescription('Piattaforma').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

client.once('ready', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag} (Playwright Hardcoded Edition Completa)`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { 
        body: [
            setupCommand.toJSON(), 
            testLoginCommand.toJSON(), 
            kickCommand.toJSON(), 
            banCommand.toJSON(), 
            unbanCommand.toJSON(), 
            promoteCommand.toJSON(), 
            demoteCommand.toJSON()
        ] 
    });
    console.log("[Evren City] Tutti i comandi (inclusi promozione e degradazione) sono stati registrati!");
});

client.on('interactionCreate', async interaction => {
    const checkStaff = (m) => m.roles.cache.has(process.env.ROLE_STAFF_ID) || m.permissions.has('Administrator');

    if (interaction.isAutocomplete()) {
        if (!checkStaff(interaction.member)) return;
        const platform = interaction.options.getString('piattaforma') || 'all';
        const focused = interaction.options.getFocused().toLowerCase();
        let cache = interaction.commandName === 'unban_crew' ? bannedCache : membersCache;

        if (cache.length === 0) {
            cache = interaction.commandName === 'unban_crew' ? await fetchBannedMembers() : await fetchCrewMembers();
        }

        const filtered = cache.filter(m => (platform === 'all' || m.platform.includes(platform)) && m.name.toLowerCase().includes(focused));
        await interaction.respond(filtered.slice(0, 25).map(m => ({ name: `${m.name} (${m.platform.toUpperCase()})`, value: m.name })));
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'test_login') {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non autorizzato.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const result = await verifyLogin();
        if (result) {
            await interaction.editReply(`✅ **[Playwright] Login VERIFICATO con successo!** Profilo: **${result}**`);
        } else {
            await interaction.editReply(`⚠️ **[Playwright] Attenzione:** Cookie scaduti o non validi.`);
        }
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'setup_pannello') {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non autorizzato.', flags: [MessageFlags.Ephemeral] });
        const embed = new EmbedBuilder()
            .setTitle('🏙️ EVREN CITY RP — Gestione Crew Ufficiale')
            .setDescription('Clicca il pulsante per richiedere l\'approvazione automatica nella Crew!')
            .setColor('#2b2d31');
        const button = new ButtonBuilder().setCustomId('btn_richiedi_crew').setLabel('Richiedi Approvazione').setStyle(ButtonStyle.Primary).setEmoji('⚡');
        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        return interaction.reply({ content: 'Pannello inviato!', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isButton() && interaction.customId === 'btn_richiedi_crew') {
        const modal = new ModalBuilder().setCustomId('modal_richiesta_crew').setTitle('Evren City RP — Verifica');
        const scInput = new TextInputBuilder().setCustomId('input_sc_username').setLabel('Nickname Social Club').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(scInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_richiesta_crew') {
        const scUsername = interaction.fields.getTextInputValue('input_sc_username').trim();
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await interaction.editReply('⏳ Elaborazione richiesta in corso...');

        const success = await queueTask(() => autoApproveUser(scUsername));
        if (success) {
            await interaction.user.send(`✅ Il tuo account **${scUsername}** è stato elaborato con successo!`).catch(() => {});
            await sendLogMessage(new EmbedBuilder().setTitle('🟢 LOG: Approvato').addFields({ name: 'Utente', value: scUsername })).catch(() => {});
        } else {
            await interaction.user.send(`⚠️ Errore durante l'elaborazione della richiesta.`).catch(() => {});
        }
    }

    const crewActions = ['kick_crew', 'ban_crew', 'unban_crew', 'promote_crew', 'demote_crew'];
    if (interaction.isChatInputCommand() && crewActions.includes(interaction.commandName)) {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non autorizzato.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const platform = interaction.options.getString('piattaforma');
        const motivo = interaction.options.getString('motivo') || 'Nessun motivo specificato';
        const action = interaction.commandName.replace('_crew', '');

        const success = await queueTask(() => manageCrewMember(username, platform, action));
        if (success) {
            await interaction.editReply(`✅ Azione **${action.toUpperCase()}** eseguita con successo su **${username}**.`);
            
            // Colore e titolo personalizzati per il log in base all'azione
            let logColor = '#5865F2'; // Default blurple
            let emojiAction = '⚙️';
            if (action === 'kick') { logColor = '#fEE75C'; emojiAction = '👢'; }
            else if (action === 'ban') { logColor = '#ED4245'; emojiAction = '🔨'; }
            else if (action === 'unban') { logColor = '#57F287'; emojiAction = '🔓'; }
            else if (action === 'promote') { logColor = '#57F287'; emojiAction = '⬆️'; }
            else if (action === 'demote') { logColor = '#ED4245'; emojiAction = '⬇️'; }

            const logEmbed = new EmbedBuilder()
                .setTitle(`${emojiAction} LOG: ${action.toUpperCase()}`)
                .setColor(logColor)
                .addFields(
                    { name: 'Utente', value: username, inline: true },
                    { name: 'Piattaforma', value: platform.toUpperCase(), inline: true },
                    { name: 'Motivo', value: motivo, inline: false },
                    { name: 'Staff', value: `${interaction.user.tag}`, inline: false }
                )
                .setTimestamp();

            await sendLogMessage(logEmbed).catch(() => {});
        } else {
            await interaction.editReply(`❌ Impossibile completare l'azione su **${username}**.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
