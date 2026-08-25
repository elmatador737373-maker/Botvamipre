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

// --- 1. CONFIGURAZIONE SUPABASE & SERVER WEB HTTP (PER UPTIMEROBOT) ---
const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('🟢 Evren City RP - Crew Bot Online & Ready!');
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

let pendingInvitesCache = [];

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

// --- 4. FUNZIONI PLAYWRIGHT (GESTIONE INVANTI & RICHIESTE) ---
async function fetchPendingInvites() {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 4000));

        const invites = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            let list = [];
            for (let row of rows) {
                const text = row.innerText ? row.innerText.trim() : '';
                if (text) {
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1 && l.length < 25);
                    for (let l of lines) {
                        if (!list.includes(l) && !l.toLowerCase().includes('accetta') && !l.toLowerCase().includes('rifiuta') && !l.toLowerCase().includes('invites')) {
                            list.push({ name: l });
                        }
                    }
                }
            }
            return list;
        });

        pendingInvitesCache = invites;
        return pendingInvitesCache;
    } catch (e) {
        return pendingInvitesCache;
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

// --- 5. COMANDI DISCORD & REGISTRAZIONE SLASH ---

const testLoginCommand = new SlashCommandBuilder().setName('test_login').setDescription('[STAFF] Test login Playwright');
const accettaCrewCommand = new SlashCommandBuilder()
    .setName('accetta_crew')
    .setDescription('[STAFF] Accetta una richiesta in sospeso')
    .addStringOption(o => o.setName('utente').setDescription('Seleziona o scrivi l ID Social Club').setRequired(true).setAutocomplete(true));

const rifiutaCrewCommand = new SlashCommandBuilder()
    .setName('rifiuta_crew')
    .setDescription('[STAFF] Rifiuta una richiesta in sospeso')
    .addStringOption(o => o.setName('utente').setDescription('Seleziona o scrivi l ID Social Club').setRequired(true).setAutocomplete(true));

const vediCrewCommand = new SlashCommandBuilder()
    .setName('vedi_crew')
    .setDescription('[STAFF] Mostra tutte le richieste pendenti della crew');

client.once('clientReady', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { 
        body: [
            testLoginCommand.toJSON(), 
            accettaCrewCommand.toJSON(),
            rifiutaCrewCommand.toJSON(),
            vediCrewCommand.toJSON()
        ] 
    });
});

// GESTIONE INTERAZIONI (AUTOCOMPLETE E COMANDI STAFF)
client.on('interactionCreate', async interaction => {
    const checkStaff = (m) => m.roles.cache.has(process.env.ROLE_STAFF_ID) || m.permissions.has('Administrator');

    // Autocomplete per i comandi staff /accetta_crew e /rifiuta_crew
    if (interaction.isAutocomplete()) {
        if (!checkStaff(interaction.member)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        
        let invites = await fetchPendingInvites();
        const filtered = invites.filter(m => m.name.toLowerCase().includes(focused));
        
        await interaction.respond(filtered.slice(0, 25).map(m => ({ name: m.name, value: m.name })));
        return;
    }

    if (!checkStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Non sei autorizzato a usare questo comando.', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'test_login') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await interaction.editReply(`✅ **[Playwright] Sistema Operativo e in ascolto code.**`);
        return;
    }

    // Comando /vedi_crew
    if (interaction.isChatInputCommand() && interaction.commandName === 'vedi_crew') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const invites = await queueTask(() => fetchPendingInvites());
        const crewLink = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📋 Richieste Pendenti Crew')
            .setDescription(invites.length > 0 
                ? invites.map((inv, idx) => `**${idx + 1}.** ${inv.name}`).join('\n') 
                : 'Nessuna richiesta pendente al momento.')
            .addFields({ name: '🔗 Link Gestione Inviti', value: `[Apri Social Club](${crewLink})` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // Comandi /accetta_crew e /rifiuta_crew
    if (interaction.isChatInputCommand() && (interaction.commandName === 'accetta_crew' || interaction.commandName === 'rifiuta_crew')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const action = interaction.commandName === 'accetta_crew' ? 'approve' : 'reject';
        const actionLabel = action === 'approve' ? 'ACCETTATA' : 'RIFIUTATA';

        const success = await queueTask(() => handleCrewInviteAction(username, action));
        if (success) {
            const embed = new EmbedBuilder()
                .setColor(action === 'approve' ? '#57F287' : '#ED4245')
                .setTitle(`✅ Richiesta ${actionLabel}`)
                .setDescription(`La richiesta di **${username}** è stata gestita con successo sul Social Club.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Invio Log dell'azione staff
            const logEmbed = new EmbedBuilder()
                .setTitle(`🛠️ STAFF CREW ACTION: ${actionLabel}`)
                .setColor(action === 'approve' ? '#57F287' : '#ED4245')
                .addFields(
                    { name: 'Staff', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                    { name: 'Social Club ID', value: username, inline: true }
                )
                .setTimestamp();
            await sendLogMessage(logEmbed);

        } else {
            await interaction.editReply(`❌ Impossibile completare l'azione per **${username}** sul Social Club.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
