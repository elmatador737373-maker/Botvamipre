import os
import threading
import asyncio
from flask import Flask
import discord
from discord.ext import commands
from groq import Groq
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Il segretario Jarvis è online e illimitato!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GROQ_KEY = os.getenv('GROQ_API_KEY')

# Client ufficiale Groq
ai_client = Groq(api_key=GROQ_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# ⚠️ INSERISCI IL TUO ID DISCORD REALE QUI SOTTO
IL_MIO_ID_DISCORD = 123456789012345678  

conversazioni_attive = {}

@bot.event
async def on_ready():
    print(f'✨ Jarvis con motore Llama 3 è online come {bot.user.name}!')

# ==========================================
# 3. GESTIONE MESSAGGI E CHAT CONTINUA
# ==========================================
@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    user_id = message.author.id
    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    ha_sessione_attiva = conversazioni_attive.get(user_id, False)

    # CONTROLLO COMANDO STOP
    if ha_sessione_attiva and "stop" in message.content.lower():
        conversazioni_attive[user_id] = False
        await message.reply("💼 *Certamente. Sessione terminata con successo. Tornerò in ascolto silenzioso fino al prossimo tag.*")
        return

    # VERIFICA SE RISPONDERE
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                await message.reply(f"💼 Salve! Il mio capo potrebbe essere impegnato, intanto parli con me. *(Può rispondere senza taggarmi, scriva 'stop' per chiudere)*")
            else:
                await message.reply("📝 Desidera qualcosa? Sono a Sua completa disposizione. *(Scriva 'stop' per chiudere la sessione)*")
            return

        if not clean_content:
            return

        async with message.channel.typing():
            try:
                # Prompt di sistema per dare l'anima di Jarvis al modello
                istruzione_sistema = (
                    f"Sei Jarvis, l'impeccabile, brillante ed efficiente segretario personale di <@{IL_MIO_ID_DISCORD}>.\n\n"
                    "REGOLE DI COMPORTAMENTO:\n"
                    "- Sii estremamente educato e formale, dando sempre del 'Lei' all'interlocutore.\n"
                    "- Cura moltissimo la formattazione di Discord: usa i **grassetti** per i punti chiave ed elenchi puntati.\n"
                    "- Inserisci emoji professionali (💼, ✨, 📝, 📊) nei messaggi per renderli visivamente attraenti.\n"
                    "- Sii sintetico e dritto al punto, evita risposte inutilmente prolisse."
                )

                # Chiamata API a Groq (Usando il modello potentissimo Llama 3.1 8b)
                completion = ai_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {"role": "system", "content": istruzione_sistema},
                        {"role": "user", "content": str(clean_content)}
                    ],
                    temperature=0.7
                )
                
                risposta_ia = completion.choices[0].message.content

                # CREAZIONE DEI PREFISSI
                if tagga_me:
                    risposta_finale = (
                        f"💼 **Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto rispondo io.**\n"
                        f"*(Risponderò ai Suoi messaggi successivi senza tag. Scriva 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content.startswith(f"<@{bot.user.id}>"):
                    risposta_finale = (
                        f"🤖 **Modalità conversazione attiva.**\n"
                        f"*(Risponderò in questa chat senza bisogno di taggarmi. Scriva 'stop' per chiudere)*\n\n"
                        f"{risposta_ia}"
                    )
                else:
                    risposta_finale = risposta_ia

                # INVIO PROTETTO ANTI-CRASH
                if len(risposta_finale) > 1900:
                    for i in range(0, len(risposta_finale), 1900):
                        await message.reply(risposta_finale[i:i+1900])
                else:
                    await message.reply(risposta_finale)
                
            except Exception as e:
                print(f"ERRORE GENERAZIONE: {str(e)}")
                if message.author.id == IL_MIO_ID_DISCORD:
                    await message.reply(f"❌ **Anomalia Capo! Errore Groq:** `{str(e)}`")
                else:
                    await message.reply("La prego di scusarmi, ho riscontrato un problema nei miei sistemi di comunicazione.")

    await bot.process_commands(message)

# ==========================================
# 4. COMANDO EXTRA: PROMEMORIA
# ==========================================
@bot.command(name="promemoria")
async def promemoria(ctx, tempo: int, *, motivo: str):
    await ctx.send(f"💼 Certamente Capo, ho annotato il promemoria: **'{motivo}'** tra {tempo} minuti.")
    await asyncio.sleep(tempo * 60)
    await ctx.send(f"🔔 {ctx.author.mention}, Le ricordo l'impegno preso: **{motivo}**.")

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
