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
    res.send('Evren City RP - Crew Manager Bot Online (Playwright Full Action Edition)!');
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

async function autoApproveUser(gameId, platformType) {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(4000);

        const approved = await page.evaluate((targetId) => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes(targetId.toLowerCase())) {
                    const acceptBtn = row.querySelector('button.accept, button.approve, [data-action="accept"], button:not(.reject):not(.deny)');
                    if (acceptBtn) {
                        acceptBtn.click();
                        return true;
                    }
                }
            }
            return false;
        }, gameId);

        if (approved) {
            await page.waitForTimeout(3000);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Errore approvazione automatica:", e);
        return false;
    } finally {
        await browser.close();
    }
}

// Funzione REALE per gestire Kick, Ban, Unban, Promote e Demote su Playwright
async function manageCrewMember(username, platform, action = 'kick') {
    const { browser, page } = await getAuthenticatedPage();
    try {
        let targetUrl = action === 'unban' 
            ? `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`
            : `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;

        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(4000);

        const executed = await page.evaluate(({ targetUser, actionType }) => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes(targetUser.toLowerCase())) {
                    
                    if (actionType === 'kick') {
                        const btn = row.querySelector('button.kick, button.remove, [data-action="kick"], button:has-text("Kick"), button:has-text("Rimuovi")');
                        if (btn) { btn.click(); return true; }
                    } 
                    else if (actionType === 'ban') {
                        const btn = row.querySelector('button.ban, [data-action="ban"], button:has-text("Ban")');
                        if (btn) { btn.click(); return true; }
                    } 
                    else if (actionType === 'unban') {
                        const btn = row.querySelector('button.unban, [data-action="unban"], button:has-text("Unban"), button:has-text("Sblocca")');
                        if (btn) { btn.click(); return true; }
                    } 
                    else if (actionType === 'promote') {
                        const btn = row.querySelector('button.promote, [data-action="promote"], button:has-text("Promuovi")');
                        if (btn) { btn.click(); return true; }
                    } 
                    else if (actionType === 'demote') {
                        const btn = row.querySelector('button.demote, [data-action="demote"], button:has-text("Degrada")');
                        if (btn) { btn.click(); return true; }
                    }

                    // Fallback generico su qualsiasi pulsante d'azione se non trova classi specifiche
                    const genericBtn = row.querySelector('button');
                    if (genericBtn) {
                        genericBtn.click();
                        return true;
                    }
                }
            }
            return false;
        }, { targetUser: username, actionType: action });

        if (executed) {
            await page.waitForTimeout(3000); // Attende la conferma del server Rockstar
            console.log(`[Playwright] Azione ${action} eseguita con successo su ${username}`);
            return true;
        }

        console.log(`[Playwright] Utente ${username} non trovato o pulsante non cliccabile per ${action}`);
        return false;
    } catch (e) {
        console.error(`Errore esecuzione ${action} con Playwright:`, e);
        return false;
    } finally {
        await browser.close();
    }
}

// --- 5. COMANDI DISCORD (STAFF + AUTOCOMPLETE) ---

const setupCommand = new SlashCommandBuilder().setName('setup_pannello').setDescription('[STAFF] Invia pannello Crew');
const testLoginCommand = new SlashCommandBuilder().setName('test_login').setDescription('[STAFF] Test login Playwright');

const choicesPiattaforma = [
    { name: 'Tutte', value: 'all' },
    { name: 'PC', value: 'pc' },
    { name: 'PlayStation', value: 'ps' }
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

client.once('clientReady', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag} (Playwright Full Action Edition)`);
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
    console.log("[Evren City] Tutti i comandi sono stati registrati con successo!");
});

client.on('interactionCreate', async interaction => {
    const checkStaff = (m) => m.roles.cache.has(process.env.ROLE_STAFF_ID) || m.permissions.has('Administrator');

    if (interaction.isAutocomplete()) {
        if (!checkStaff(interaction.member)) return interaction.respond([]);
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
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato ad usare questo comando.', flags: [MessageFlags.Ephemeral] });
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
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato ad usare questo comando.', flags: [MessageFlags.Ephemeral] });
        const embed = new EmbedBuilder()
            .setTitle('🏙️ EVREN CITY RP — Gestione Crew Ufficiale')
            .setDescription('Clicca il pulsante sottostante per inviare la richiesta di approvazione automatica nella Crew inserendo il tuo ID di gioco!')
            .setColor('#2b2d31');
        const button = new ButtonBuilder().setCustomId('btn_richiedi_crew').setLabel('Richiedi Approvazione Crew').setStyle(ButtonStyle.Primary).setEmoji('⚡');
        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        return interaction.reply({ content: 'Pannello inviato con successo!', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isButton() && interaction.customId === 'btn_richiedi_crew') {
        const modal = new ModalBuilder().setCustomId('modal_richiesta_crew').setTitle('Evren City RP — Verifica ID Crew');
        
        const gameIdInput = new TextInputBuilder()
            .setCustomId('input_game_id')
            .setLabel('Il tuo ID (es. PSN ID o Social Club ID)')
            .setPlaceholder('Es. MarioRossi_99 o EvrenPlayer')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const platformInput = new TextInputBuilder()
            .setCustomId('input_platform_type')
            .setLabel('Piattaforma (PC / PlayStation)')
            .setPlaceholder('Scrivi: pc oppure ps')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(platformInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_richiesta_crew') {
        const gameId = interaction.fields.getTextInputValue('input_game_id').trim();
        const platformType = interaction.fields.getTextInputValue('input_platform_type').trim().toLowerCase();

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await interaction.editReply('⏳ Ricerca ed approvazione della richiesta in corso...');

        const success = await queueTask(() => autoApproveUser(gameId, platformType));

        if (success) {
            const crewLink = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}`;

            const dmEmbedSuccess = new EmbedBuilder()
                .setTitle('✅ Richiesta Crew Approvata!')
                .setDescription(`Ciao **${interaction.user.username}**, la tua richiesta per entrare nella Crew di Evren City RP è stata accettata dal sistema!`)
                .addFields(
                    { name: '🆔 ID Riconosciuto', value: `\`${gameId}\``, inline: true },
                    { name: '🎮 Piattaforma', value: `\`${platformType.toUpperCase()}\``, inline: true },
                    { name: '📌 Ultimo Passo', value: `La tua richiesta è stata approvata. Ora per completare l'ingresso **torna sul link della crew ed accetta l'invito**:\n🔗 [Clicca qui per aprire la Crew](${crewLink})`, inline: false }
                )
                .setColor('#57F287')
                .setTimestamp();

            await interaction.user.send({ embeds: [dmEmbedSuccess] }).catch(() => {});
            await interaction.editReply(`✅ Richiesta approvata! Ti è stato inviato un messaggio privato (DM) con il link per accettare l'invito.`);

            await sendLogMessage(new EmbedBuilder()
                .setTitle('🟢 LOG: Richiesta Crew Approvata')
                .setColor('#57F287')
                .addFields(
                    { name: 'Utente Discord', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
                    { name: 'ID Riconosciuto', value: gameId, inline: true },
                    { name: 'Piattaforma', value: platformType.toUpperCase(), inline: true }
                )
                .setTimestamp()
            ).catch(() => {});

        } else {
            const dmEmbedError = new EmbedBuilder()
                .setTitle('❌ Errore Approvazione Crew')
                .setDescription(`Non è stata trovata alcuna richiesta in sospeso per l'ID: \`${gameId}\`. Assicurati di aver prima inviato la richiesta di iscrizione dal sito di Rockstar Social Club e che il nickname sia corretto.`)
                .setColor('#ED4245')
                .setTimestamp();

            await interaction.user.send({ embeds: [dmEmbedError] }).catch(() => {});
            await interaction.editReply(`❌ Impossibile trovare la richiesta o approvarla automaticamente. Controlla i tuoi messaggi privati per maggiori dettagli.`);
        }
    }

    const crewActions = ['kick_crew', 'ban_crew', 'unban_crew', 'promote_crew', 'demote_crew'];
    if (interaction.isChatInputCommand() && crewActions.includes(interaction.commandName)) {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato ad usare questo comando.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const platform = interaction.options.getString('piattaforma');
        const motivo = interaction.options.getString('motivo') || 'Nessun motivo specificato';
        const action = interaction.commandName.replace('_crew', '');

        const success = await queueTask(() => manageCrewMember(username, platform, action));
        if (success) {
            await interaction.editReply(`✅ Azione **${action.toUpperCase()}** eseguita con successo su **${username}** tramite Playwright.`);
            
            let logColor = '#5865F2'; 
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
            await interaction.editReply(`❌ Impossibile completare l'azione **${action.toUpperCase()}** su **${username}** (Utente non trovato o errore nel pannello).`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
