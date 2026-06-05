import os
import threading
import asyncio
from flask import Flask
import discord
from discord.ext import commands
from google import genai
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK (Anti-Sleep Render)
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Il segretario è online e attivo!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

# Client ufficiale Gemini SDK (Aggiornato)
ai_client = genai.Client(api_key=GEMINI_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# ⚠️ IMPORTANTE: Metti qui il tuo ID numerico reale di Discord
IL_MIO_ID_DISCORD = 123456789012345678  

# Dizionario di stato: {user_id: True/False} per ricordare chi è in chat attiva
conversazioni_attive = {}

@bot.event
async def on_ready():
    print(f'✨ Jarvis è online e operativo come {bot.user.name}!')

# ==========================================
# 3. GESTIONE MESSAGGI E CONVERSAZIONE CONTINUA
# ==========================================
@bot.event
async def on_message(message):
    # Evita che il bot risponda a se stesso
    if message.author == bot.user:
        return

    user_id = message.author.id
    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    # Controlla se l'utente ha la sessione attiva
    ha_sessione_attiva = conversazioni_attive.get(user_id, False)

    # --------------------------------------------------------
    # CONTROLLO COMANDO DI STOP
    # --------------------------------------------------------
    if ha_sessione_attiva and "stop" in message.content.lower():
        conversazioni_attive[user_id] = False
        await message.reply("💼 *Certamente. Sessione terminata con successo. Tornerò in modalità silenziosa fino al prossimo tag.*")
        return

    # ==========================================
    # DETERMINA SE IL BOT DEVE RISPONDERE
    # ==========================================
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        # Se viene taggato il bot e la sessione non era attiva, la attiviamo ora
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        # Pulizia del testo dai tag per non confondere l'IA
        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        # Se il testo è vuoto e non c'è una sessione attiva, rispondi con un messaggio di cortesia
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                await message.reply(f"💼 Salve! Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me. *(Può scrivere senza taggarmi. Dica 'stop' per chiudere)*")
            else:
                await message.reply("📝 Desidera qualcosa? Sono a sua completa disposizione. *(Scriva 'stop' per congedarmi)*")
            return

        # Se l'utente preme invio a vuoto durante una sessione attiva, ignoriamo
        if not clean_content:
            return

        # ==========================================
        # ELABORAZIONE CON GEMINI (PROMPT ELEGANTE)
        # ==========================================
        async with message.channel.typing():
            try:
                # Prompt di sistema raffinato (Jarvis: formale, pulito, usa grassetti ed emoji)
                istruzione_sistema = (
                    f"Sei Jarvis, il leggendario, efficiente e brillante segretario personale di <@{IL_MIO_ID_DISCORD}>.\n\n"
                    "LINEE GUIDA PER IL COMPORTAMENTO:\n"
                    "- Il tuo tono deve essere impeccabile: estremamente educato, formale (dai sempre del 'Lei' all'interlocutore), ma anche arguto e brillante.\n"
                    "- Sei devoto al tuo Capo. Se interagisci con altri utenti, mantieni alta la sua reputazione.\n\n"
                    "LINEE GUIDA PER LO STILE:\n"
                    "- Cura moltissimo la formattazione di Discord: usa il **grassetto** per i concetti chiave e elenchi puntati per dividere i testi.\n"
                    "- Usa le emoji in modo mirato e professionale (es. 💼, 📝, 📊, ✨) per rendere i messaggi visivamente attraenti.\n"
                    "- Sii conciso e dritto al punto, evita risposte inutilmente prolisse.\n"
                    "- Ricorda implicitamente all'utente che sta parlando in una chat continua e che può dire 'stop' quando desidera terminare."
                )

                # Chiamata all'API forzata come stringa pulita
                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=str(clean_content),
                    config={"system_instruction": istruzione_sistema}
                )
                
                if response and hasattr(response, 'text') and response.text:
                    risposta_ia = response.text
                else:
                    risposta_ia = "Mi scusi, non sono riuscito a elaborare una risposta valida nei miei database."

                # --------------------------------------------------------
                # GESTIONE PREFISSI GRAFICI (Solo al primo aggancio)
                # --------------------------------------------------------
                if tagga_me:
                    risposta_finale = (
                        f"💼 **Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me.**\n"
                        f"*(Risponderò ai Suoi messaggi successivi senza bisogno di tag. Scriva 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content == f"<@{bot.user.id}> {clean_content}":
                    # Mette l'avviso di "aggancio" solo sul primo messaggio in cui è presente il tag
                    risposta_finale = (
                        f"🤖 **Modalità conversazione attiva.**\n"
                        f"*( Jarvis è a Sua disposizione. Risponderò senza tag. Scriva 'stop' per chiudere la sessione )*\n\n"
                        f"{risposta_ia}"
                    )
                else:
                    # Durante la chat continuata manda solo il testo pulito e formattato dell'IA
                    risposta_finale = risposta_ia

                # --------------------------------------------------------
                # PROTEZIONE ANTI-CRASH (Spezza i messaggi oltre i 2000 caratteri)
                # --------------------------------------------------------
                if len(risposta_finale) > 1900:
                    for i in range(0, len(risposta_finale), 1900):
                        await message.reply(risposta_finale[i:i+1900])
                else:
                    await message.reply(risposta_finale)
                
            except Exception as e:
                # Stampa l'errore reale nella console di Render se qualcosa va storto
                print(f"--- ERRORE RILEVATO DA PYTHON: {str(e)} ---")
                await message.reply("La prego di scusarmi, ho riscontrato una breve anomalia nei miei sistemi di comunicazione.")

    # Elabora i comandi standard col prefisso (es: !promemoria)
    await bot.process_commands(message)

# ==========================================
# 4. COMANDO EXTRA: PROMEMORIA
# ==========================================
@bot.command(name="promemoria")
async def promemoria(ctx, tempo: int, *, motivo: str):
    """Esempio: !promemoria 10 Controllare i file del server"""
    await ctx.send(f"💼 Certamente Capo, ho annotato il promemoria: **'{motivo}'** tra {tempo} minuti.")
    await asyncio.sleep(tempo * 60)
    await ctx.send(f"🔔 {ctx.author.mention}, Le ricordo l'impegno preso: **{motivo}**.")

# ==========================================
# 5. AVVIO MULTI-THREAD (Flask + Discord)
# ==========================================
if __name__ == "__main__":
    # Avvia il server Flask in background per tenere sveglio Render
    t = threading.Thread(target=run_flask)
    t.start()
    
    # Avvia il bot di Discord
    bot.run(DISCORD_TOKEN)
