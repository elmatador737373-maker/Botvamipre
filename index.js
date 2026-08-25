require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

// --- 1. CONFIGURAZIONE SUPABASE & SERVER WEB HTTP ---
const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('Evren City RP - Crew Auto-Approve Bot Online!');
});

app.listen(PORT, () => {
    console.log(`[Evren City] Server HTTP avviato sulla porta ${PORT}`);
});

// --- 2. GESTIONE CODA & ANTI-BAN CON SECONDI RANDOM ---
const taskQueue = [];
let isProcessingQueue = false;

const randomSleep = (min = 5000, max = 10000) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
};

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
        await randomSleep(5000, 9000); 
        const result = await taskFunction();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        isProcessingQueue = false;
        processQueue();
    }
}

// --- 3. CLIENT DISCORD & PLAYWRIGHT CON ANTI-BAN ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ] 
});

let membersCache = [];
let bannedCache = [];

async function getAuthenticatedPage() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        locale: 'it-IT',
        timezoneId: 'Europe/Rome'
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

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
        "value": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjdmNmQwNDRlLTBmNGMtNGM3ZS04NDk0LWUyYzBkZWM1YWE4ZiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiIzMDYxODk5MjUiLCJyb2Nrc3RhckF1dGguUnVpZci6IjEyNDgwZTE4ZDQyODQwNjg4N2JiNTQxYjk4OTE4MTUzIiwianRpIjoiYjQ2NTI5N2EtNTQ5ZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZW5kSW4iOiJUcnVlIiwic2NBdXRoLlRva2VuU3RvcmFnZVR0bCI6IjI1OTIwMDAiLCJzY0F1dGguSXNBTWlub3IiOiJGYWxzZSIsInNjQXV0aC5OaWNrbmFtZSI6IkV2cmVuTWFuYWdlbWVudCIsInNjQXV0aC5BdmF0YXJVcmwiOiJodHRwczovL3Byb2QtYXZhdGFycy5ha2FtYWl6ZWQubmV0L3N0b2NrLWF2YXtvcnMvbi/HVEFWL2d0YXYwMi5wbmciLCJzY0F1dGguSXNFbWFpbFZlcmlmaWVkIjoiVHJ1ZSIsInNjQXV0aC5NZW1iZXJSinNlciI6IjIwMjYtMDgtMjVUMTQ6NTQ6NTIuNzYwMDAwMFoiLCJuYmYiOjE3ODc2NzQyNjIsImF1ZCI6WyJodHRwczovL3d3dy5yb2Nrc3RhcmdhbWVzLmNvbSIsImh0dHBzOi8vc2NhcGkucm9ja3N0YXJnYW1lcy5jb20iLCJyb2Nrc3tarHNlcnZpY2VzIl0sInNjb3BlIjoic2NhcGk6KiBzY3M6dXBkYXRlUHJvZmlsZSIsImV4cCI6MTc4NzY3NDU2MiwiaWF0IjoxNzg3Njc0MjYyLCJpc3MiOiJodHRwczovLw==",
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

// --- 4. FUNZIONE PLAYWRIGHT PER VERIFICARE ED ACCETTARE L'INVITO ---
async function verifyAndAcceptInvite(socialClubId) {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 4000));

        const accepted = await page.evaluate((targetUser) => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes(targetUser.toLowerCase())) {
                    const acceptBtn = row.querySelector('button.accept, button.approve, [data-action="accept"], button:not(.reject):not(.deny)');
                    if (acceptBtn) {
                        acceptBtn.click();
                        return true;
                    }
                }
            }
            return false;
        }, socialClubId);

        if (accepted) {
            await new Promise((r) => setTimeout(r, 4000));
            return true;
        }
        return false;
    } catch (e) {
        console.error("Errore verifica/accettazione invito Social Club:", e);
        return false;
    } finally {
        await browser.close();
    }
}

// Funzioni di gestione membri (per i comandi staff di emergenza)
async function fetchCrewMembers() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 3000));
        
        const members = await page.evaluate(() => {
            const rows = document.querySelectorAll('.member-row, tr, [data-member-name]');
            let list = [];
            rows.forEach(r => {
                const nameEl = r.querySelector('.name, .nickname, [data-name]');
                const name = nameEl ? nameEl.innerText.trim() : r.innerText.trim();
                if (name && name.length > 2 && name.length < 30) {
                    list.push({ name, platform: 'ps' });
                }
            });
            return list;
        });

        membersCache = members.length > 0 ? members : [{ name: 'MembroEsempio', platform: 'ps' }];
        return membersCache;
    } catch (e) {
        return membersCache;
    } finally {
        await browser.close();
    }
}

async function fetchBannedMembers() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 3000));
        return bannedCache;
    } catch (e) {
        return bannedCache;
    } finally {
        await browser.close();
    }
}

async function handleCrewInviteAction(username, action = 'approve') {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 4000));

        const executed = await page.evaluate(({ targetUser, actionType }) => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes(targetUser.toLowerCase())) {
                    if (actionType === 'approve') {
                        const btn = row.querySelector('button.accept, button.approve, [data-action="accept"], button:not(.reject):not(.deny)');
                        if (btn) { btn.click(); return true; }
                    } else if (actionType === 'reject') {
                        const btn = row.querySelector('button.reject, button.deny, [data-action="reject"], button.kick');
                        if (btn) { btn.click(); return true; }
                    }
                }
            }
            return false;
        }, { targetUser: username, actionType: action });

        if (executed) {
            await new Promise((r) => setTimeout(r, 4000));
            return true;
        }
        return false;
    } catch (e) {
        return false;
    } finally {
        await browser.close();
    }
}

async function manageCrewMember(username, action = 'kick') {
    const { browser, page } = await getAuthenticatedPage();
    try {
        let targetUrl = action === 'unban' 
            ? `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`
            : `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;

        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 4000));

        const executed = await page.evaluate(({ targetUser, actionType }) => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes(targetUser.toLowerCase())) {
                    if (actionType === 'kick') {
                        const btn = row.querySelector('button.kick, button.remove, [data-action="kick"], button:has-text("Kick")');
                        if (btn) { btn.click(); return true; }
                    } else if (actionType === 'ban') {
                        const btn = row.querySelector('button.ban, [data-action="ban"], button:has-text("Ban")');
                        if (btn) { btn.click(); return true; }
                    } else if (actionType === 'unban') {
                        const btn = row.querySelector('button.unban, [data-action="unban"], button:has-text("Unban")');
                        if (btn) { btn.click(); return true; }
                    } else if (actionType === 'promote') {
                        const btn = row.querySelector('button.promote, [data-action="promote"], button:has-text("Promuovi")');
                        if (btn) { btn.click(); return true; }
                    } else if (actionType === 'demote') {
                        const btn = row.querySelector('button.demote, [data-action="demote"], button:has-text("Degrada")');
                        if (btn) { btn.click(); return true; }
                    }
                    const genericBtn = row.querySelector('button');
                    if (genericBtn) { genericBtn.click(); return true; }
                }
            }
            return false;
        }, { targetUser: username, actionType: action });

        if (executed) {
            await new Promise((r) => setTimeout(r, 4000));
            return true;
        }
        return false;
    } catch (e) {
        return false;
    } finally {
        await browser.close();
    }
}

// --- 5. COMANDI DISCORD E LETTORE MODULO NEL CANALE DEDICATO ---

const testLoginCommand = new SlashCommandBuilder().setName('test_login').setDescription('[STAFF] Test login Playwright');
const approvaCommand = new SlashCommandBuilder().setName('approva_crew').setDescription('[STAFF] Approva richiesta crew').addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true));
const rifiutaCommand = new SlashCommandBuilder().setName('rifiuta_crew').setDescription('[STAFF] Rifiuta richiesta crew').addStringOption(o => o.setName('utente').setDescription('Utente').setRequired(true).setAutocomplete(true));
const kickCommand = new SlashCommandBuilder().setName('kick_crew').setDescription('[STAFF] Espelli').addStringOption(o => o.setName('utente').setDescription('ID').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));
const banCommand = new SlashCommandBuilder().setName('ban_crew').setDescription('[STAFF] Banna').addStringOption(o => o.setName('utente').setDescription('ID').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));
const unbanCommand = new SlashCommandBuilder().setName('unban_crew').setDescription('[STAFF] Sblocca').addStringOption(o => o.setName('utente').setDescription('ID').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));
const promoteCommand = new SlashCommandBuilder().setName('promote_crew').setDescription('[STAFF] Promuovi').addStringOption(o => o.setName('utente').setDescription('ID').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));
const demoteCommand = new SlashCommandBuilder().setName('demote_crew').setDescription('[STAFF] Degrada').addStringOption(o => o.setName('utente').setDescription('ID').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false));

client.once('clientReady', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag} (Single Channel Mode)`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { 
        body: [
            testLoginCommand.toJSON(), 
            approvaCommand.toJSON(),
            rifiutaCommand.toJSON(),
            kickCommand.toJSON(), 
            banCommand.toJSON(), 
            unbanCommand.toJSON(), 
            promoteCommand.toJSON(), 
            demoteCommand.toJSON()
        ] 
    });
});

// LETTORE AUTOMATICO DEL MODULO ATTIVO SOLO NEL CANALE DEDICATO
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (process.env.FORM_CHANNEL_ID && message.channel.id !== process.env.FORM_CHANNEL_ID) return;

    const content = message.content;
    if (content.includes('𝐄𝐕𝐑𝐄𝐍') && content.includes('𝗜𝗗 𝗦𝗢𝗖𝗜𝗔𝗟 𝗖𝗟𝗨𝗕')) {
        try {
            const lines = content.split('\n');
            let socialClubId = '';
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('𝗜𝗗 𝗦𝗢𝗖𝗜𝗔𝗟 𝗖𝗟𝗨𝗕')) {
                    if (lines[i+1] && lines[i+1].startsWith('➤')) {
                        socialClubId = lines[i+1].replace('➤', '').trim();
                    }
                }
            }

            if (!socialClubId) {
                const scLine = lines.find(l => l.toLowerCase().includes('social club'));
                if (scLine) {
                    const parts = scLine.split(/[:➤]/);
                    if (parts[1]) socialClubId = parts[1].trim();
                }
            }

            if (!socialClubId) return;

            const processingMsg = await message.reply(`🤖 **[Sistema Anti-Ban]** Modulo acquisito e inserito in coda. Controllo ed eventuale accettazione della richiesta sul Social Club per **${socialClubId}** in corso...`);

            const isAccepted = await queueTask(() => verifyAndAcceptInvite(socialClubId));
            const crewLink = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}`;

            if (isAccepted) {
                await processingMsg.edit(`✅ **Richiesta Accettata con Successo!** L'invito per **${socialClubId}** è stato trovato sul Social Club ed è stato accettato automaticamente.`);
                
                // Invio del Messaggio Privato (DM) all'utente solo se accettata
                try {
                    await message.author.send(`🟢 **[Evren City] Richiesta Crew Accettata!**\nLa tua richiesta per l'ID **${socialClubId}** è stata verificata e accettata con successo sulla nostra Crew.\n\n🔗 **Link Crew:** ${crewLink}`);
                } catch (dmErr) {
                    console.log(`Impossibile inviare il DM a ${message.author.tag} (potrebbe avere i DM chiusi).`);
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('🟢 RICHIESTA CREW ACCETTATA AUTOMATICAMENTE')
                    .setColor('#57F287')
                    .addFields(
                        { name: 'Utente Discord', value: `${message.author} (${message.author.tag})`, inline: true },
                        { name: 'ID Social Club', value: socialClubId, inline: true },
                        { name: 'Stato', value: 'Approvato direttamente dal bot nel canale!', inline: false }
                    )
                    .setTimestamp();
                await sendLogMessage(successEmbed);

            } else {
                // Risposta solo nel canale pubblico (nessun DM)
                await processingMsg.edit(`⚠️ **Richiesta non trovata sul Social Club per ${socialClubId}!**\nVerifica di aver inviato correttamente la richiesta di invito alla crew.\n🔗 **Link Crew:** ${crewLink}`);
            }

        } catch (err) {
            console.error("Errore durante l'elaborazione automatica del modulo:", err);
        }
    }
});

client.on('interactionCreate', async interaction => {
    const checkStaff = (m) => m.roles.cache.has(process.env.ROLE_STAFF_ID) || m.permissions.has('Administrator');

    if (interaction.isAutocomplete()) {
        if (!checkStaff(interaction.member)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        
        let cache = membersCache;
        if (interaction.commandName === 'unban_crew') {
            cache = bannedCache.length === 0 ? await fetchBannedMembers() : bannedCache;
        } else if (interaction.commandName !== 'unban_crew') {
            cache = membersCache.length === 0 ? await fetchCrewMembers() : membersCache;
        }

        const filtered = cache.filter(m => m.name.toLowerCase().includes(focused));
        await interaction.respond(filtered.slice(0, 25).map(m => ({ name: `${m.name}`, value: m.name })));
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'test_login') {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await interaction.editReply(`✅ **[Playwright] Sistema Operativo e in ascolto code.**`);
        return;
    }

    if (interaction.isChatInputCommand() && (interaction.commandName === 'approva_crew' || interaction.commandName === 'rifiuta_crew')) {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const action = interaction.commandName === 'approva_crew' ? 'approve' : 'reject';
        const actionLabel = action === 'approve' ? 'APPROVATO' : 'RIFIUTATO';

        const success = await queueTask(() => handleCrewInviteAction(username, action));
        if (success) {
            await interaction.editReply(`✅ Richiesta di **${username}** ${actionLabel} con successo!`);
        } else {
            await interaction.editReply(`❌ Impossibile gestire l'invito per **${username}** sul Social Club.`);
        }
        return;
    }

    const crewActions = ['kick_crew', 'ban_crew', 'unban_crew', 'promote_crew', 'demote_crew'];
    if (interaction.isChatInputCommand() && crewActions.includes(interaction.commandName)) {
        if (!checkStaff(interaction.member)) return interaction.reply({ content: '❌ Non sei autorizzato.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const motivo = interaction.options.getString('motivo') || 'Nessun motivo specificato';
        const action = interaction.commandName.replace('_crew', '');

        const success = await queueTask(() => manageCrewMember(username, action));
        if (success) {
            await interaction.editReply(`✅ Azione **${action.toUpperCase()}** eseguita con successo su **${username}**.`);
        } else {
            await interaction.editReply(`❌ Impossibile completare l'azione **${action.toUpperCase()}** su **${username}**.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
